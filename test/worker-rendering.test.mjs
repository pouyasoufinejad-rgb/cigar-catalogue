import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  applyStructuralOverridesToHtml,
  extractStockTargetsFromHtml,
  injectEntriesIntoHtml,
  renderEntryCard
} from '../src/index.js';

function parseJsonc(text) {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
}

test('root catalogue HTML is routed through the Worker before assets', async () => {
  const config = parseJsonc(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const routes = config.assets?.run_worker_first;
  assert.ok(Array.isArray(routes));
  assert.ok(routes.includes('/'), 'run_worker_first must include /');
  assert.ok(routes.includes('/index.html'), 'run_worker_first must include /index.html');
});

test('KV-only dynamic entry is injected into catalogue HTML', () => {
  const html = '<!doctype html><html><body><div id="flat-main"></div></body></html>';
  const transformed = injectEntriesIntoHtml(html, {
    'kv-only-test': {
      key: 'kv-only-test',
      brand: 'Test Brand',
      title: 'KV-only cigar',
      price: 12,
      quality: 7,
      strength: 6,
      length: 4,
      ring: 32,
      rank: 1,
      risk: 1
    }
  });

  assert.match(transformed, /data-dynamic-entry="1"/);
  assert.match(transformed, /data-key="kv-only-test"/);
  assert.match(transformed, /Test Brand/);
  assert.match(transformed, /KV-only cigar/);
});

test('single-pass structural overrides update every matching card without touching others', () => {
  const html = [
    '<article class="card" data-key="one" data-taster="1"><h3><span>Brand One</span>Old One</h3></article>',
    '<article class="card" data-key="two"><h3><span>Brand Two</span>Old Two</h3></article>',
    '<article class="card" data-key="three"><h3><span>Brand Three</span>Unchanged</h3></article>'
  ].join('');

  const transformed = applyStructuralOverridesToHtml(html, {
    one: { title: 'New One', taster: false },
    two: { title: 'New Two', taster: true }
  });

  assert.match(transformed, /data-key="one"><h3><span>Brand One<\/span>New One<\/h3>/);
  assert.match(transformed, /data-key="two" data-taster="1"><h3><span>Brand Two<\/span>New Two<\/h3>/);
  assert.match(transformed, /data-key="three"><h3><span>Brand Three<\/span>Unchanged<\/h3>/);
});

test('structural overrides process a production-sized catalogue in one bounded pass', () => {
  const cardCount = 100;
  const filler = 'x'.repeat(80_000);
  const cards = Array.from({ length: cardCount }, (_value, index) =>
    `<article class="card" data-key="card-${index}" data-taster="1"><p>${filler}</p></article>`
  ).join('');
  const overrides = Object.fromEntries(
    Array.from({ length: cardCount }, (_value, index) => [`card-${index}`, { taster: false }])
  );

  const started = performance.now();
  const transformed = applyStructuralOverridesToHtml(cards, overrides);
  const elapsed = performance.now() - started;

  assert.doesNotMatch(transformed, /data-taster=/);
  assert.ok(elapsed < 75, `structural override pass took ${elapsed.toFixed(0)}ms`);
});

test('stock targets retain one URL for each of the five audited retailers', () => {
  const html = `<article class="card" data-key="five-retailers" data-stock="out">
    <h3><span>Test Brand</span>Test Cigar</h3>
    <a class="shop" href="https://www.cigarhut.com.au/test-cigar/">Cigar Hut</a>
    <a class="shop" href="https://www.cigarworld.com.au/aud/products/test-cigar.html">Cigarworld</a>
    <a class="shop" href="https://cigarbox.com.au/products/test-cigar">CigarBox</a>
    <a class="shop" href="https://firmincigars.com.au/product/test-cigar/">Firmin Cigars</a>
    <a class="shop" href="https://www.theindexcigars.com.au/products/test-cigar">The Index</a>
  </article>`;

  const [target] = extractStockTargetsFromHtml(html);

  assert.deepEqual(target.links, [
    { retailer: 'CigarHut', url: 'https://www.cigarhut.com.au/test-cigar/' },
    { retailer: 'Cigarworld', url: 'https://www.cigarworld.com.au/aud/products/test-cigar.html' },
    { retailer: 'CigarBox', url: 'https://cigarbox.com.au/products/test-cigar' },
    { retailer: 'Firmin Cigars', url: 'https://firmincigars.com.au/product/test-cigar/' },
    { retailer: 'The Index', url: 'https://www.theindexcigars.com.au/products/test-cigar' }
  ]);
});

test('catalogue cards show friendly labels for Firmin Cigars and The Index', () => {
  const html = renderEntryCard({
    key: 'retailer-labels',
    brand: 'Test Brand',
    title: 'Test Cigar',
    retailerLinks: [
      'https://firmincigars.com.au/product/test-cigar/',
      'https://www.theindexcigars.com.au/products/test-cigar'
    ]
  });

  assert.match(html, />View at Firmin Cigars <span>/);
  assert.match(html, />View at The Index <span>/);
});
