// The card-level flavour sweep repaints every card whenever catalogue state refreshes. It
// used to read the card override alone, so on a card showing an alternate blend it painted
// the wrong cigar's Flavour over the one the blend selector had just applied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { renderEntryCard } from '../src/index.js';

globalThis.__CATALOGUE_VARIANT_TEST__ = true;

const CUBANITOS = Object.freeze({
  key: 'cub',
  brand: 'Arturo Fuente',
  title: 'Cubanitos',
  eyebrow: 'Compact Cameroon Fuente',
  country: 'DR',
  strength: 6,
  quality: 8,
  flavour: 7,
  risk: 1,
  rank: 4,
  length: 4.5,
  ring: 32,
  packagePrice: 140,
  packageLabel: 'pack of 10',
  price: 14,
  stock: 'in',
  productionLines: ['Wrapper: African Cameroon'],
  practicalLines: ['Pack of 10'],
  smokeTime: '25–35 min smoke',
  summaryHtml: '<strong>Chestnut.</strong>',
  retailerLinks: [],
  blendVariants: [
    { id: 'natural', label: 'Natural' },
    {
      id: 'maduro', label: 'Maduro', title: 'Cubanitos Maduro', eyebrow: 'Broadleaf counterpart',
      length: 4.5, ring: 32, packagePrice: 129, packageCount: 10, packageLabel: 'tin of 10',
      price: 12.9, country: 'DR', strength: 8, quality: 8, flavour: 9, risk: 1, stock: 'in',
      productionLines: ['Wrapper: Connecticut Broadleaf'], practicalLines: ['Tin of 10'],
      smokeTime: '25–35 min smoke', summaryHtml: '<strong>Cocoa.</strong>', retailerLinks: []
    }
  ],
  defaultBlendVariantId: 'natural'
});

function mount() {
  const dom = new JSDOM(
    `<!doctype html><html><body><div class="controls"></div>
      <div class="grid">${renderEntryCard(CUBANITOS)}</div></body></html>`,
    { url: 'https://example.test/' }
  );
  for (const name of ['window', 'document', 'MutationObserver', 'Node', 'Element', 'HTMLElement', 'CSS']) {
    globalThis[name] = name === 'window' ? dom.window : dom.window[name];
  }
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  return dom;
}

function subscore(card, label) {
  return [...card.querySelectorAll('.rating')]
    .find(node => node.querySelector(':scope > span')?.textContent === label)
    ?.querySelector('.subscore')?.textContent ?? '(none)';
}

test('the flavour sweep keeps the active blend rating instead of the parent one', async () => {
  const dom = mount();
  const card = dom.window.document.querySelector('article.card');

  const { applyBlendToCard } = await import('../public/catalogue-variant-runtime.mjs');
  const flavourModule = await import('../public/catalogue-flavour.mjs');
  const { setVariantState } = await import('../public/catalogue-variant-runtime.mjs');

  const catalogueState = {
    version: 3,
    cards: { cub: structuredClone(CUBANITOS) },
    entries: { cub: structuredClone(CUBANITOS) },
    sections: {}
  };
  setVariantState(catalogueState);

  assert.equal(subscore(card, 'Flavour'), '7/10', 'the served card opens on the Natural');

  applyBlendToCard(card, CUBANITOS, 'maduro');
  assert.equal(card.dataset.activeBlend, 'maduro');
  assert.equal(subscore(card, 'Flavour'), '9/10', 'selecting Maduro applies its Flavour');
  assert.equal(subscore(card, 'Strength'), '8/10');

  // What actually broke it: a state refresh repainting the card afterwards.
  flavourModule.applyCatalogueState(catalogueState);
  assert.equal(subscore(card, 'Flavour'), '9/10', 'the sweep must not restore the Natural 7');
  assert.equal(subscore(card, 'Strength'), '8/10');
});

test('a card with no blends still reads its Flavour from the card override', async () => {
  const dom = mount();
  const card = dom.window.document.querySelector('article.card');
  const flavourModule = await import('../public/catalogue-flavour.mjs');
  const plain = { ...structuredClone(CUBANITOS), flavour: 4 };
  delete plain.blendVariants;
  delete plain.defaultBlendVariantId;
  flavourModule.applyCatalogueState({
    version: 3, cards: { cub: plain }, entries: {}, sections: {}
  });
  assert.equal(subscore(card, 'Flavour'), '4/10');
});
