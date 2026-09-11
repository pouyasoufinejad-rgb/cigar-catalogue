import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractRetailerPrice,
  readStockCache,
  runStockCheck,
  STOCK_PRICE_SCHEMA_VERSION
} from '../src/stock.js';
import { retailerPriceForRow } from '../public/catalogue-convenience.mjs';

test('extracts the intended variant price from structured product offers', () => {
  const html = `<!doctype html><html><head><script type="application/ld+json">{
    "@context":"https://schema.org",
    "@type":"Product",
    "name":"The Wise Man Maduro Lancero",
    "offers":[
      {"@type":"Offer","price":"51.50","priceCurrency":"AUD"},
      {"@type":"Offer","price":"990.00","priceCurrency":"AUD"}
    ]
  }</script></head><body><h1>The Wise Man Maduro Lancero</h1></body></html>`;

  assert.equal(extractRetailerPrice(html, {
    title:'The Wise Man Maduro Lancero',
    packageLabel:'single full lancero',
    packagePrice:49
  }), 51.5);
});

test('extracts an exact product-page price from a visible range using the catalogue purchase benchmark', () => {
  const html = '<main><h1>The Wise Man Maduro Lancero</h1><div class="price">Now: $49.00 - $919.00</div><button>Add to Cart</button></main>';
  assert.equal(extractRetailerPrice(html, {
    title:'The Wise Man Maduro Lancero',
    packageLabel:'single full lancero',
    packagePrice:49
  }), 49);
});

test('matches the correct product and package on retailer category pages instead of taking a nearby unrelated price', () => {
  const html = `<main><ul>
    <li class="product"><a href="/charter-oak-single">Foundation Charter Oak Habano Grande Single</a><span>$49.00</span></li>
    <li class="product"><a href="/wise-man-box">THE WISE MAN MADURO - LANCERO - BOX OF 20 - 7 X 40</a><span>$1,130.00</span></li>
    <li class="product"><a href="/wise-man-single">THE WISE MAN MADURO - LANCERO - Single - 7 X 40</a><span>$58.50</span></li>
  </ul></main>`;

  assert.equal(extractRetailerPrice(html, {
    title:'The Wise Man Maduro Lancero',
    packageLabel:'single full lancero',
    packagePrice:49
  }), 58.5);
});

test('full stock checks persist a numeric price beside each retailer status', async () => {
  class MemoryKv {
    constructor() { this.values = new Map(); }
    async get(key) { return this.values.get(key) ?? null; }
    async put(key, value) { this.values.set(key, String(value)); }
  }

  const env = { CATALOGUE_STATE:new MemoryKv() };
  const state = {
    entries:{
      sample:{
        brand:'Foundation',
        title:'The Wise Man Maduro Lancero',
        packagePrice:49,
        packageLabel:'single full lancero',
        stock:'in',
        retailerLinks:['https://www.theindexcigars.com.au/products/test']
      }
    }
  };
  const productHtml = `<html><head><script type="application/ld+json">{
    "@type":"Product","name":"The Wise Man Maduro Lancero",
    "offers":[{"@type":"Offer","price":"51.50","priceCurrency":"AUD"}]
  }</script></head><body><main><h1>The Wise Man Maduro Lancero</h1><button>Add to Cart</button></main></body></html>`;

  await runStockCheck(env, state, 'full', {
    html:'',
    now:12345,
    fetchImpl:async () => new Response(productHtml, { status:200 })
  });
  const cache = await readStockCache(env);
  assert.equal(cache.results.sample.retailers[0].price, 51.5);
  assert.equal(cache.results.sample.priceSchemaVersion, STOCK_PRICE_SCHEMA_VERSION);
});

test('matrix renders the actual cached price for every matching retailer row', () => {
  const result = {
    retailers:[
      { retailer:'CigarHut', url:'https://www.cigarhut.com.au/test/', status:'in', price:49 },
      { retailer:'The Index', url:'https://www.theindexcigars.com.au/products/test', status:'in', price:51.5 },
      { retailer:'Cigarworld', url:'https://www.cigarworld.com.au/aud/categories/test/', status:'in', price:58.5 }
    ]
  };

  assert.equal(retailerPriceForRow(result, 'https://www.cigarhut.com.au/test/', 'CigarHut', 0, 'A$49 · single full lancero', 'A$24.50'), 'A$49');
  assert.equal(retailerPriceForRow(result, 'https://www.theindexcigars.com.au/products/test', 'The Index', 1, 'A$49 · single full lancero', 'A$24.50'), 'A$51.50');
  assert.equal(retailerPriceForRow(result, 'https://www.cigarworld.com.au/aud/categories/test/', 'Cigarworld', 2, 'A$49 · single full lancero', 'A$24.50'), 'A$58.50');
});

test('matrix keeps the first-row catalogue benchmark as a fallback for old stock-cache records', () => {
  const result = { retailers:[{ retailer:'CigarHut', url:'https://www.cigarhut.com.au/test/', status:'in' }] };
  assert.equal(retailerPriceForRow(result, 'https://www.cigarhut.com.au/test/', 'CigarHut', 0, 'A$49 · single full lancero', 'A$24.50'), 'A$49 · single full lancero · A$24.50 / stick');
  assert.equal(retailerPriceForRow(result, 'https://www.theindexcigars.com.au/products/test', 'The Index', 1, 'A$49 · single full lancero', 'A$24.50'), '—');
});
