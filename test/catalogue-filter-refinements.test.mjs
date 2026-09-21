import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  collectRetailerHosts,
  installCatalogueFilterRefinements,
  priceMatches,
  retailerHost,
  retailerLabel
} from '../public/catalogue-filter-refinements.mjs';

test('price bands use the requested 15 / 35 / 60 boundaries', () => {
  assert.equal(priceMatches('under10', 14.99), true);
  assert.equal(priceMatches('under10', 15), false);
  assert.equal(priceMatches('tenplus', 15), true);
  assert.equal(priceMatches('tenplus', 34.99), true);
  assert.equal(priceMatches('tenplus', 35), false);
  assert.equal(priceMatches('stretch', 35), true);
  assert.equal(priceMatches('stretch', 60), true);
  assert.equal(priceMatches('stretch', 60.01), false);
});

test('retailer hosts are normalised and labelled', () => {
  assert.equal(retailerHost('https://www.cigarhut.com.au/example/'), 'cigarhut.com.au');
  assert.equal(retailerLabel('cigarhut.com.au'), 'CigarHut');
  assert.equal(retailerLabel('theindexcigars.com.au'), 'The Index');
});

test('nested variant retailer links are included in retailer discovery', () => {
  const hosts = collectRetailerHosts({
    retailerLinks:['https://www.cigarbox.com.au/base'],
    sizeVariants:[
      { id:'short', retailerLinks:['https://www.cigarhut.com.au/short'] }
    ],
    blendVariants:[
      { id:'natural', retailerLinks:['https://www.theindexcigars.com.au/natural'] }
    ]
  });
  assert.deepEqual(
    [...hosts].sort(),
    ['cigarbox.com.au', 'cigarhut.com.au', 'theindexcigars.com.au']
  );
});

test('UI replaces the old price bands and adds retailer below them', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="controls">
      <div class="sort-pair">
        <label>Sort by <select id="sort"><option>Recommended order</option></select></label>
      </div>
      <div class="toggle">
        <button data-filter="instock">In stock</button>
        <button class="active" data-filter="all">All recommendations</button>
        <button data-filter="under10">Under A$10</button>
        <button data-filter="tenplus">A$10–20</button>
        <button data-filter="stretch">A$20–25</button>
        <button data-filter="premium">A$25–50</button>
      </div>
    </div>
    <article class="card" data-key="one" data-price="12" data-stock="in">
      <a class="shop" href="https://www.cigarhut.com.au/one">Shop</a>
    </article>
    <article class="card" data-key="two" data-price="40" data-stock="in">
      <a class="shop" href="https://www.theindexcigars.com.au/two">Shop</a>
    </article>
  </body></html>`, { url:'https://example.test/' });

  const { document } = dom.window;
  dom.window.applyCatalogueFilter = () => {};
  dom.window.refreshGroupVisibility = () => {};

  const fetchImpl = async () => ({
    ok:true,
    async json() {
      return {
        cards:{
          one:{
            sizeVariants:[
              { id:'other', retailerLinks:['https://www.cigarbox.com.au/one-other'] }
            ]
          }
        },
        entries:{}
      };
    }
  });

  assert.equal(installCatalogueFilterRefinements(document, dom.window, fetchImpl), true);
  await new Promise(resolve => dom.window.setTimeout(resolve, 10));

  assert.equal(document.querySelector('[data-filter="under10"]').textContent, 'Under A$15');
  assert.equal(document.querySelector('[data-filter="tenplus"]').textContent, 'A$15–35');
  assert.equal(document.querySelector('[data-filter="stretch"]').textContent, 'A$35–60');
  assert.equal(document.querySelector('[data-filter="premium"]'), null);

  const retailer = document.getElementById('catalogue-retailer-filter');
  assert.ok(retailer);
  assert.equal(retailer.closest('.controls')?.lastElementChild?.contains(retailer), true);

  const labels = [...retailer.options].map(option => option.textContent);
  assert.ok(labels.includes('CigarHut'));
  assert.ok(labels.includes('CigarBox'));
  assert.ok(labels.includes('The Index'));

  retailer.value = 'cigarhut.com.au';
  retailer.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  assert.equal(document.querySelector('[data-key="one"]').classList.contains('hidden'), false);
  assert.equal(document.querySelector('[data-key="two"]').classList.contains('hidden'), true);
});
