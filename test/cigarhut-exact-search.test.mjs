import test from 'node:test';
import assert from 'node:assert/strict';

import { readStockCache, runStockCheck } from '../src/stock.js';

class MemoryKv {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, String(value)); }
}

function stateFor(url) {
  return {
    cards: {},
    entries: {
      sample: {
        brand: 'Sample',
        title: 'Cigar',
        packagePrice: 113,
        packageLabel: 'tin of 10',
        stock: 'unknown',
        archived: false,
        retailerLinks: [url]
      }
    }
  };
}

const PRODUCT = 'https://www.cigarhut.com.au/sample-cigar-tin-of-10/';
const listingHtml = `
<main>
  <article class="product">
    <a href="${PRODUCT}">Sample Cigar Tin of 10</a>
    <span class="price">$113.00</span>
    <a href="${PRODUCT}">Add to Cart</a>
  </article>
</main>`;

test('GitHub stock mode uses exact CigarHut search without a broad category sweep or redundant direct request', async () => {
  const env = { CATALOGUE_STATE: new MemoryKv() };
  const calls = [];
  const fetchImpl = async input => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/search.php?')) return new Response(listingHtml, { status: 200 });
    throw new Error(`Unexpected retailer fetch: ${url}`);
  };

  await runStockCheck(env, stateFor(PRODUCT), 'full', {
    html: '',
    now: 12345,
    fetchImpl,
    cigarHutExactSearch: true
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /cigarhut\.com\.au\/search\.php\?/);
  const cache = await readStockCache(env);
  assert.deepEqual(cache.results.sample.retailers[0], {
    retailer: 'CigarHut',
    status: 'in',
    url: PRODUCT,
    price: 113
  });
});

test('exact CigarHut search falls back to the product URL only to confirm a missing listing is delisted', async () => {
  const env = { CATALOGUE_STATE: new MemoryKv() };
  const calls = [];
  const fetchImpl = async input => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/search.php?')) return new Response('<main>No matching products</main>', { status: 200 });
    if (url.startsWith(PRODUCT)) return new Response('Not found', { status: 404 });
    throw new Error(`Unexpected retailer fetch: ${url}`);
  };

  await runStockCheck(env, stateFor(PRODUCT), 'full', {
    html: '',
    now: 12345,
    fetchImpl,
    cigarHutExactSearch: true
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0], /cigarhut\.com\.au\/search\.php\?/);
  assert.match(calls[1], /sample-cigar-tin-of-10/);
  const cache = await readStockCache(env);
  assert.equal(cache.results.sample.retailers[0].status, 'delisted');
  assert.equal('price' in cache.results.sample.retailers[0], false);
});
