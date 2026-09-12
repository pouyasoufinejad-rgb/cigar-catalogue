import test from 'node:test';
import assert from 'node:assert/strict';

import { handleStockImport } from '../src/index.js';
import { readStockCache, STOCK_PRICE_SCHEMA_VERSION } from '../src/stock.js';

class MemoryKv {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, String(value)); }
}

function importRequest(payload, token='secret') {
  return new Request('https://catalogue.example/api/stock/import', {
    method:'POST',
    headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
    body:JSON.stringify(payload)
  });
}

test('admin stock import replaces the cache with a validated crawler snapshot', async () => {
  const env = { CATALOGUE_STATE:new MemoryKv(), ADMIN_TOKEN:'secret' };
  const payload = {
    results:{
      sample:{
        status:'in',
        lastAttemptStatus:'in',
        checkedAt:12345,
        lastAttemptAt:12345,
        priceSchemaVersion:STOCK_PRICE_SCHEMA_VERSION,
        retailers:[
          { retailer:'CigarHut', status:'in', url:'https://www.cigarhut.com.au/test/', price:113 },
          { retailer:'Cigarworld', status:'out', url:'https://www.cigarworld.com.au/aud/products/test.html', price:120 }
        ]
      }
    },
    meta:{ lastRestockAt:12345, lastFullAt:12345 }
  };

  const response = await handleStockImport(importRequest(payload), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.cards, 1);

  const cache = await readStockCache(env);
  assert.deepEqual(cache, payload);
});

test('stock import requires admin authentication', async () => {
  const env = { CATALOGUE_STATE:new MemoryKv(), ADMIN_TOKEN:'secret' };
  const response = await handleStockImport(importRequest({results:{},meta:{}}, 'wrong'), env);
  assert.equal(response.status, 401);
});

test('stock import rejects malformed retailer rows instead of poisoning the live cache', async () => {
  const env = { CATALOGUE_STATE:new MemoryKv(), ADMIN_TOKEN:'secret' };
  const payload = {
    results:{ bad:{ status:'in', retailers:[{ retailer:'CigarHut', status:'maybe', url:'javascript:alert(1)', price:-4 }] } },
    meta:{ lastRestockAt:12345, lastFullAt:12345 }
  };
  const response = await handleStockImport(importRequest(payload), env);
  assert.equal(response.status, 400);
  const cache = await readStockCache(env);
  assert.deepEqual(cache.results, {});
});
