// The card splits into a front face (ratings, prices, stock, retailer links) and a back
// face (Experience chips and prose), with a control that turns it over. Three renderers
// build this structure, so each one is checked against the same expectations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import { renderEntryCard } from '../src/index.js';
import { BACK_FACE_SELECTORS, FRONT_LABEL, BACK_LABEL } from '../public/catalogue-card-faces.mjs';
import { splitAll } from '../scripts/split-static-card-faces.mjs';

globalThis.__CATALOGUE_VARIANT_TEST__ = true;
globalThis.__CATALOGUE_CARD_FLIP_TEST__ = true;

const ENTRY = Object.freeze({
  key: 'faces-fixture', brand: 'Brand', title: 'Title', eyebrow: 'Eyebrow',
  rank: 1, length: 5, ring: 44, price: 20, packagePrice: 20, packageLabel: 'single cigar',
  country: 'DR', strength: 7, quality: 8, flavour: 7, risk: 1, stock: 'in',
  experienceTags: ['Nicotine: High'], summaryHtml: '<strong>The prose.</strong>',
  noteHtml: 'The note.', productionLines: ['Handmade'], practicalLines: ['Single cigar'],
  smokeTime: '40 min smoke', retailerLinks: ['https://example.com/buy']
});

function cardOf(html) {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document.querySelector('article.card');
}

test('the rendered card puts prose and Experience on the back, everything actionable on the front', () => {
  const card = cardOf(renderEntryCard(ENTRY));
  for (const selector of BACK_FACE_SELECTORS) {
    assert.ok(card.querySelector(`.card-face-back ${selector}`), `${selector} belongs on the back`);
    assert.equal(card.querySelector(`.card-face-front ${selector}`), null, `${selector} must not stay on the front`);
  }
  for (const selector of ['a.shop', '.facts', '.value-calc', '.freshness', '.eyebrow', 'h3']) {
    assert.ok(card.querySelector(`.card-face-front ${selector}`), `${selector} belongs on the front`);
  }
});

test('the flip control names the face it opens and starts closed', () => {
  const card = cardOf(renderEntryCard(ENTRY));
  const control = card.querySelector('.card-flip');
  assert.equal(control.getAttribute('aria-expanded'), 'false');
  assert.equal(control.querySelector('.card-flip-label').textContent, FRONT_LABEL);
  assert.equal(card.querySelector('.card-face-back').id, control.getAttribute('aria-controls'));
});

test('the control sits in the card body, outside both faces', () => {
  const card = cardOf(renderEntryCard(ENTRY));
  assert.equal(card.querySelector('.card-flip').closest('.card-face'), null);
  assert.ok(card.querySelector('.cardbody > .card-flip'));
});

test('a card with no note still renders a back face', () => {
  const card = cardOf(renderEntryCard({ ...ENTRY, noteHtml: '', experienceTags: [] }));
  assert.ok(card.querySelector('.card-face-back'));
  assert.ok(card.querySelector('.card-face-back p.summary'));
});

test('every static card in the page carries faces and a control', async () => {
  const dom = new JSDOM(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
  const cards = [...dom.window.document.querySelectorAll('article.card')];
  assert.ok(cards.length >= 45, `expected the page's static cards, found ${cards.length}`);
  for (const card of cards) {
    assert.ok(card.querySelector('.card-face-front'), 'front face');
    assert.ok(card.querySelector('.card-face-back'), 'back face');
    assert.ok(card.querySelector('.cardbody > .card-flip'), 'flip control');
    for (const selector of BACK_FACE_SELECTORS) {
      if (card.querySelector(selector)) {
        assert.ok(card.querySelector(`.card-face-back ${selector}`), `${selector} on the back`);
      }
    }
    if (card.querySelector('a.shop')) assert.ok(card.querySelector('.card-face-front a.shop'));
  }
});

test('the static split is idempotent, so re-running it cannot nest faces', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const again = splitAll(html);
  assert.equal(again.split, 0, 'no card was split a second time');
  assert.equal(again.html, html, 'the page is unchanged');
});

test('back-face ids are unique across the page, so the controls stay unambiguous', async () => {
  const dom = new JSDOM(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
  const ids = [...dom.window.document.querySelectorAll('.card-face-back')].map(node => node.id);
  assert.equal(ids.filter(Boolean).length, ids.length, 'every back face has an id');
  assert.equal(new Set(ids).size, ids.length, 'and no id is reused');
});

test('flipping toggles the article state and the control label', async () => {
  const dom = new JSDOM(`<!doctype html><body>${renderEntryCard(ENTRY)}</body>`);
  globalThis.document = dom.window.document;
  const { toggleCard, isFlipped } = await import('../public/catalogue-card-flip.mjs');
  const card = dom.window.document.querySelector('article.card');
  const control = card.querySelector('.card-flip');

  assert.equal(isFlipped(card), false);
  toggleCard(card);
  assert.equal(isFlipped(card), true);
  assert.equal(control.getAttribute('aria-expanded'), 'true');
  assert.equal(control.querySelector('.card-flip-label').textContent, BACK_LABEL);
  toggleCard(card);
  assert.equal(isFlipped(card), false);
  assert.equal(control.querySelector('.card-flip-label').textContent, FRONT_LABEL);
});

test('the stylesheet takes the inactive face out of flow so the front can shrink', async () => {
  const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const href = page.match(/<link rel="stylesheet" href="(\/css\/catalogue-[0-9a-f]{10}\.css)">/)?.[1];
  assert.ok(href, 'the page links a hashed stylesheet');
  const css = await readFile(new URL(`../public${href}`, import.meta.url), 'utf8');
  assert.match(css, /\.card-face-back,article\.card\[data-flipped="1"\] \.card-face-front\{position:absolute/);
  assert.match(css, /\.card-faces\{position:relative;display:flex;flex-direction:column;flex:1\}/);
  // The retailer links push themselves down against the flex column; it has to continue
  // through the faces or they stop hugging the bottom of the card.
  assert.match(css, /\.card-face\{display:flex;flex-direction:column;flex:1/);
});

// The blend selector rebuilds the Experience chips and the note from scratch. Before the
// split those were inserted after .medals and after p.summary; both would now land on the
// front face, putting a blend's tasting copy on top of its prices.
test('rebuilding a blend puts its chips and note back on the back face', async (t) => {
  const withBlends = {
    ...ENTRY,
    key: 'faces-blend',
    blendVariants: [
      { id: 'one', label: 'One' },
      {
        id: 'two', label: 'Two', title: 'Title Two', length: 5, ring: 44, price: 21,
        packagePrice: 21, packageLabel: 'single cigar', country: 'DR', strength: 8,
        quality: 8, flavour: 9, risk: 1, stock: 'in',
        experienceTags: ['Nicotine: Medium', 'Pairings: Coffee'],
        summaryHtml: '<strong>Second prose.</strong>', noteHtml: 'Second note.',
        productionLines: ['Handmade'], practicalLines: ['Single cigar'],
        smokeTime: '40 min smoke', retailerLinks: ['https://example.com/two']
      }
    ],
    defaultBlendVariantId: 'one'
  };

  const dom = new JSDOM(
    `<!doctype html><html><body><div class="controls"></div>
      <div class="grid">${renderEntryCard(withBlends)}</div></body></html>`,
    { url: 'https://example.test/' }
  );
  for (const name of ['window', 'document', 'MutationObserver', 'Node', 'Element', 'HTMLElement', 'CSS']) {
    globalThis[name] = name === 'window' ? dom.window : dom.window[name];
  }
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

  const { applyBlendToCard, setVariantState } = await import('../public/catalogue-variant-runtime.mjs');
  // Prime the state the way a loaded page has it. Without this the runtime goes looking for
  // the catalogue API, and there is none to answer here.
  setVariantState({
    version: 3,
    cards: { [withBlends.key]: structuredClone(withBlends) },
    entries: { [withBlends.key]: structuredClone(withBlends) },
    sections: {}
  });
  const card = dom.window.document.querySelector('article.card');
  applyBlendToCard(card, withBlends, 'two');

  assert.equal(card.querySelectorAll('.tag-groups').length, 1, 'no duplicate chip block');
  assert.ok(card.querySelector('.card-face-back .tag-groups'), 'chips landed on the back');
  assert.equal(card.querySelector('.card-face-front .tag-groups'), null);
  assert.ok(card.querySelector('.card-face-back p.mog-note'), 'the note landed on the back');
  assert.equal(card.querySelector('.card-face-front p.mog-note'), null);
  assert.match(card.querySelector('.card-face-back p.mog-note').textContent, /Second note/);
  assert.ok(card.querySelector('.card-face-front a.shop'), 'the links stayed on the front');

  // The runtime leaves jsdom timers pending, which is harmless in a browser and stops the
  // test process exiting here. Closing the window clears them.
  t.after(() => dom.window.close());
});
