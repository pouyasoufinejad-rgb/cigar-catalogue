import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readStockCache,
  runStockCheck,
  STOCK_META_KEY,
  STOCK_RESULTS_KEY
} from '../src/stock.js';

class MemoryKv {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, String(value)); }
}

const CURRENT_URL = 'https://www.cigarhut.com.au/current-cigar/';

function currentState() {
  return {
    cards: {},
    entries: {
      current: {
        brand: 'Current',
        title: 'Cigar',
        packagePrice: 50,
        packageLabel: 'single cigar',
        stock: 'in',
        archived: false,
        retailerLinks: [CURRENT_URL]
      }
    }
  };
}

test('full stock refresh prunes cached cards that are no longer current catalogue targets', async () => {
  const previous = {
    current: {
      status: 'in', lastAttemptStatus: 'in', checkedAt: 1, lastAttemptAt: 1, priceSchemaVersion: 2,
      retailers: [{ retailer: 'CigarHut', status: 'in', url: CURRENT_URL, price: 49 }]
    },
    stale: {
      status: 'unknown', lastAttemptStatus: 'unknown', checkedAt: 1, lastAttemptAt: 1, priceSchemaVersion: 2,
      retailers: [{ retailer: 'CigarHut', status: 'unknown', url: 'https://www.cigarhut.com.au/deleted-old-product/' }]
    }
  };
  const env = {
    CATALOGUE_STATE: new MemoryKv({
      [STOCK_RESULTS_KEY]: JSON.stringify(previous),
      [STOCK_META_KEY]: JSON.stringify({ lastRestockAt: 1, lastFullAt: 1 })
    })
  };
  const listing = `<article><a href="${CURRENT_URL}">Current Cigar</a><span class="price">$50.00</span><a href="${CURRENT_URL}">Add to Cart</a></article>`;
  const fetchImpl = async input => {
    const url = String(input);
    if (url.includes('/search.php?')) return new Response(listing, { status: 200 });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await runStockCheck(env, currentState(), 'full', {
    html: '',
    now: 10,
    fetchImpl,
    cigarHutExactSearch: true
  });

  const cache = await readStockCache(env);
  assert.deepEqual(Object.keys(cache.results), ['current']);
  assert.equal(cache.results.current.retailers[0].price, 50);
});
