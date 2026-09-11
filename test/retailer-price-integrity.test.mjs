import test from 'node:test';
import assert from 'node:assert/strict';

import { extractRetailerPrice, readStockCache, runStockCheck } from '../src/stock.js';

class MemoryKv {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, String(value)); }
}

test('generic category AggregateOffer metadata cannot override an exact visible product row', () => {
  const html = `<!doctype html><html><head>
    <script type="application/ld+json">{
      "@context":"https://schema.org",
      "@type":"Product",
      "name":"FOUNDATION CIGAR COMPANY",
      "offers":{"@type":"AggregateOffer","lowPrice":"41.00","highPrice":"1130.00","priceCurrency":"AUD"}
    }</script>
  </head><body><main><ul>
    <li class="ListView"><div class="ProductDetails"><a href="/corona">THE WISE MAN MADURO - CORONA - Single - 5 X 48</a><span class="ProductPrice">$41.00</span></div></li>
    <li class="ListView"><div class="ProductDetails"><a href="/lancero-box">THE WISE MAN MADURO - LANCERO - BOX OF 20 - 7 X 40</a><span class="ProductPrice">$1,130.00</span></div></li>
    <li class="ListView"><div class="ProductDetails"><a href="/lancero-single">THE WISE MAN MADURO - LANCERO - Single - 7 X 40</a><span class="ProductPrice">$58.50</span></div></li>
  </ul></main></body></html>`;

  assert.equal(extractRetailerPrice(html, {
    title:'Foundation The Wise Man Maduro Lancero',
    packageLabel:'single full lancero',
    packagePrice:49
  }), 58.5);
});

test('CigarHut exact search listing overrides a false positive product-page stock signal', async () => {
  const env = { CATALOGUE_STATE:new MemoryKv() };
  const productUrl = 'https://www.cigarhut.com.au/java-x-press-maduro/';
  const state = { entries:{ sample:{
    brand:'Java', title:'X-Press Maduro', packagePrice:99, packageLabel:'single', stock:'in', retailerLinks:[productUrl]
  } } };
  let searchFetches = 0;
  const fetchImpl = async rawUrl => {
    const url = new URL(rawUrl);
    if (url.pathname === '/cigars/') return new Response('<main></main>', { status:200 });
    if (url.pathname === '/java-x-press-maduro/') {
      return new Response('<main><h1>Java X-Press Maduro</h1><div>Now: $99.00 - $469.00</div><h2>Related Products</h2><a href="/other">Add to Cart</a></main>', { status:200 });
    }
    if (url.pathname === '/search.php') {
      searchFetches += 1;
      return new Response(`<main><article class="product"><a href="${productUrl}">Java X-Press Maduro</a><span>$99.00</span><a href="${productUrl}">Sold out</a></article></main>`, { status:200 });
    }
    return new Response('', { status:404 });
  };

  await runStockCheck(env, state, 'full', { html:'', now:12345, fetchImpl });
  const cache = await readStockCache(env);
  assert.equal(searchFetches, 1);
  assert.equal(cache.results.sample.retailers[0].status, 'out');
  assert.equal(cache.results.sample.retailers[0].price, 99);
});

test('CigarHut 404 with no exact search match is classified as delisted rather than unknown', async () => {
  const env = { CATALOGUE_STATE:new MemoryKv() };
  const productUrl = 'https://www.cigarhut.com.au/alonso-menendez-axe-charutos-pack-of-5/';
  const state = { entries:{ sample:{
    brand:'Alonso Menendez', title:'Axe Charutos Pack of 5', packagePrice:48, packageLabel:'pack of 5', stock:'in', retailerLinks:[productUrl]
  } } };
  const fetchImpl = async rawUrl => {
    const url = new URL(rawUrl);
    if (url.pathname === '/cigars/') return new Response('<main></main>', { status:200 });
    if (url.pathname === '/alonso-menendez-axe-charutos-pack-of-5/') return new Response('<main><h1>404 Error - Page not found</h1></main>', { status:404 });
    if (url.pathname === '/search.php') return new Response('<main><p>No products found.</p></main>', { status:200 });
    return new Response('', { status:404 });
  };

  await runStockCheck(env, state, 'full', { html:'', now:12345, fetchImpl });
  const cache = await readStockCache(env);
  assert.equal(cache.results.sample.retailers[0].status, 'delisted');
  assert.equal(cache.results.sample.retailers[0].price, undefined);
});
