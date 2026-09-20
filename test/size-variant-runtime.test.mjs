import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { renderEntryCard } from '../src/index.js';

globalThis.__CATALOGUE_VARIANT_TEST__ = true;

const NO_9 = Object.freeze({
  key: 'liga-privada-no-9-petit-corona-oscuro',
  brand: 'Liga Privada', title: 'No. 9 Petit Corona Oscuro',
  eyebrow: 'Fullest-ring exact No. 9 short', country: 'Nicaragua',
  strength: 8, quality: 9, flavour: 8, risk: 1, rank: 7,
  length: 4.25, ring: 46, packagePrice: 44, packageLabel: 'single cigar', price: 44,
  smokeTime: '40–55 min smoke',
  summaryHtml: '<strong>Espresso and dark cocoa.</strong>',
  noteHtml: 'Cigar Hut lists the single at A$44.',
  retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9-petit-corona-oscuro/'],
  defaultVariantId: 'petit-corona',
  sizeVariants: [
    {
      id: 'petit-corona', label: 'Petit Corona', title: 'No. 9 Petit Corona Oscuro',
      length: 4.25, ring: 46, packagePrice: 44, packageLabel: 'single cigar',
      retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9-petit-corona-oscuro/'],
      smokeTime: '40–55 min smoke'
    },
    {
      id: 'short-panatela', label: 'Short Panatela', title: 'No. 9 Short Panatela Oscuro',
      length: 4.5, ring: 40, packagePrice: 37, packageLabel: 'single cigar',
      retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9-short-panatela-oscuro/'],
      smokeTime: '35–50 min smoke'
    },
    { id: 'toro', label: 'Toro', title: 'No. 9 Toro', length: 6, ring: 52 }
  ]
});

const AXE = Object.freeze({
  key: 'alonso-menendez-axe-charutos',
  brand: 'Alonso Menendez', title: 'Axe Charutos', eyebrow: 'Value benchmark',
  country: 'Brazil', strength: 6, quality: 6, flavour: 7, risk: 1, rank: 17,
  length: 4.6, ring: 35, packagePrice: 48, packageLabel: 'pack of 5', price: 9.6,
  summaryHtml: '<strong>Cedar.</strong>',
  retailerLinks: ['https://www.cigarhut.com.au/alonso-menendez-axe-charutos/']
});

function mount({ admin = false, url = 'https://example.test/' } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      ${admin ? '<div id="catalogue-admin-panel"></div>' : ''}
      <div class="controls"></div>
      <div class="grid">${renderEntryCard(NO_9)}${renderEntryCard(AXE)}</div>
    </body></html>`, { url });
  for (const name of ['window', 'document', 'MutationObserver', 'Node', 'Element', 'HTMLElement', 'CSS']) {
    globalThis[name] = name === 'window' ? dom.window : dom.window[name];
  }
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  return dom;
}

const STATE = () => ({
  cards: { [NO_9.key]: { ...NO_9 }, [AXE.key]: { ...AXE } },
  entries: { [NO_9.key]: { ...NO_9 }, [AXE.key]: { ...AXE } }
});

async function runtime() {
  return import('../public/catalogue-variant-runtime.mjs');
}

function cardOf(dom, key) {
  return dom.window.document.querySelector(`article.card[data-key="${key}"]`);
}
function factOf(card, index) {
  return card.querySelectorAll('.facts > div')[index].querySelector('b').textContent;
}

test('selecting a size rewrites the card in place', async () => {
  const dom = mount();
  const api = await runtime();
  api.setVariantState(STATE());

  const card = cardOf(dom, NO_9.key);
  assert.equal(card.querySelector('h3').textContent, 'Liga PrivadaNo. 9 Petit Corona Oscuro');

  api.selectVariant(NO_9.key, 'short-panatela');

  assert.equal(card.querySelector('h3').textContent, 'Liga PrivadaNo. 9 Short Panatela Oscuro');
  assert.equal(factOf(card, 0), 'A$37');
  assert.equal(factOf(card, 1), 'A$37');
  assert.equal(factOf(card, 2), '4.5″ × 40');
  assert.equal(card.querySelector('.artframe').dataset.visualRing, '40');
  assert.equal(card.querySelector('a.shop').href,
    'https://www.cigarhut.com.au/liga-privada-no-9-short-panatela-oscuro/');
  assert.equal(card.querySelector('[data-variant-select]').value, 'short-panatela');
});

test('selecting a size does not change the saved default', async () => {
  const dom = mount();
  const api = await runtime();
  const state = STATE();
  api.setVariantState(state);

  api.selectVariant(NO_9.key, 'toro');
  const card = cardOf(dom, NO_9.key);
  assert.equal(card.dataset.activeVariant, 'toro');
  assert.equal(card.dataset.defaultVariant, 'petit-corona');
  assert.equal(state.cards[NO_9.key].defaultVariantId, 'petit-corona');
  assert.equal(state.entries[NO_9.key].defaultVariantId, 'petit-corona');
});

test('an unpriced size shows no price and an unrated Value', async () => {
  const dom = mount();
  const api = await runtime();
  api.setVariantState(STATE());

  api.selectVariant(NO_9.key, 'toro');
  const card = cardOf(dom, NO_9.key);
  assert.equal(factOf(card, 0), '—');
  assert.equal(factOf(card, 1), '—');
  assert.equal(card.dataset.priceUnverified, '1');

  const value = [...card.querySelectorAll('.rating')]
    .find(node => node.querySelector(':scope > span').textContent === 'Value');
  assert.ok(value.classList.contains('value-unrated'));
  assert.equal(value.querySelector('b').textContent, 'Unrated');
  assert.equal(value.querySelector('.subscore').textContent, 'No AU price');

  // Going back to a priced size clears it again rather than leaving the card unrated.
  api.selectVariant(NO_9.key, 'petit-corona');
  assert.equal(value.classList.contains('value-unrated'), false);
  assert.equal(factOf(card, 1), 'A$44');
});

test('promoting the active size saves only the default and leaves ratings alone', async () => {
  const dom = mount({ admin: true });
  const api = await runtime();
  const state = STATE();
  api.setVariantState(state);

  const sent = [];
  const fetchImpl = async (url, options) => {
    sent.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200 };
  };

  api.selectVariant(NO_9.key, 'short-panatela');
  const patch = await api.promoteActiveVariant(NO_9.key, { fetchImpl });

  assert.deepEqual(patch, { defaultVariantId: 'short-panatela' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, '/api/catalogue-overrides');
  // The write touches the default and nothing else: no price, no rating, no rank.
  assert.deepEqual(Object.keys(sent[0].body.cards[NO_9.key]), ['defaultVariantId']);
  assert.deepEqual(Object.keys(sent[0].body.entries[NO_9.key]), ['defaultVariantId']);
  assert.equal(state.cards[NO_9.key].defaultVariantId, 'short-panatela');
  assert.equal(cardOf(dom, NO_9.key).dataset.defaultVariant, 'short-panatela');
});

test('promoting the size that is already default writes nothing', async () => {
  mount({ admin: true });
  const api = await runtime();
  api.setVariantState(STATE());
  let called = 0;
  const fetchImpl = async () => { called += 1; return { ok: true, status: 200 }; };
  const result = await api.promoteActiveVariant(NO_9.key, { fetchImpl });
  assert.equal(result, null);
  assert.equal(called, 0);
});

test('a selected size is addressable by URL and restored from one', async () => {
  const dom = mount();
  const api = await runtime();
  api.setVariantState(STATE());

  api.selectVariant(NO_9.key, 'toro');
  assert.match(dom.window.location.href, /variant=liga-privada-no-9-petit-corona-oscuro%3Atoro/);
  assert.deepEqual(api.readVariantFromUrl(dom.window.location.href),
    { key: NO_9.key, variantId: 'toro' });

  // Selecting the default again clears the parameter, so a shared link stays clean.
  api.selectVariant(NO_9.key, 'petit-corona');
  assert.doesNotMatch(dom.window.location.href, /variant=/);
});

test('a deep link opens the card with that size already selected', async () => {
  const dom = mount({ url: `https://example.test/?variant=${NO_9.key}:short-panatela` });
  const api = await runtime();
  api.setVariantState(STATE());
  api.applyAllVariants();

  const card = cardOf(dom, NO_9.key);
  assert.equal(card.dataset.activeVariant, 'short-panatela');
  assert.equal(card.querySelector('h3').textContent, 'Liga PrivadaNo. 9 Short Panatela Oscuro');
  assert.equal(card.dataset.defaultVariant, 'petit-corona', 'a link does not change the default');
});

test('searching a vitola opens its parent card with that size selected', async () => {
  const dom = mount();
  const api = await runtime();
  api.setVariantState(STATE());

  const hit = api.openSearchResult('Liga No 9 Short Panatela');
  assert.equal(hit.key, NO_9.key);
  assert.equal(hit.variantId, 'short-panatela');
  const card = cardOf(dom, NO_9.key);
  assert.equal(card.dataset.activeVariant, 'short-panatela');
  assert.ok(card.classList.contains('search-hit'));
});

test('the search box mounts and resolves a typed query', async () => {
  const dom = mount();
  const api = await runtime();
  api.setVariantState(STATE());
  api.ensureVariantSearch();

  const input = dom.window.document.getElementById('catalogue-variant-search-input');
  assert.ok(input, 'a search control should exist');
  input.value = 'no 9 toro';
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  assert.equal(cardOf(dom, NO_9.key).dataset.activeVariant, 'toro');
  assert.match(dom.window.document.querySelector('.catalogue-variant-search-status').textContent,
    /liga-privada-no-9-petit-corona-oscuro/);
});

test('a card without variants is untouched by the variant runtime', async () => {
  const dom = mount();
  const api = await runtime();
  api.setVariantState(STATE());

  const card = cardOf(dom, AXE.key);
  const before = card.outerHTML;
  api.applyAllVariants();
  assert.equal(card.outerHTML, before, 'no variants means no rewriting at all');
  assert.equal(card.dataset.activeVariant, undefined);
  assert.equal(card.querySelector('[data-variant-select]'), null);
  assert.equal(api.selectVariant(AXE.key, 'anything'), null);
});

test('the admin promote control appears only for an admin, and only on a multi-size card', async () => {
  const readerDom = mount();
  const reader = await runtime();
  reader.setVariantState(STATE());
  await reader.initVariantRuntime({ fetchImpl: async () => ({ ok: false, status: 401 }) });
  assert.equal(readerDom.window.document.querySelector('.catalogue-variant-default'), null,
    'a reader gets no promote button');

  const adminDom = mount({ admin: true });
  const admin = await runtime();
  admin.setVariantState(STATE());
  await admin.initVariantRuntime({ fetchImpl: async () => ({ ok: false, status: 401 }) });
  const buttons = adminDom.window.document.querySelectorAll('.catalogue-variant-default');
  assert.equal(buttons.length, 1, 'one button, on the only card with sizes to choose between');
  assert.equal(buttons[0].closest('article.card').dataset.key, NO_9.key);
});

test('a size carries its own Practical block, because cadence follows ring gauge', async () => {
  const dom = mount();
  const api = await runtime();
  const state = STATE();
  // Ring 46 is a Forgiving cadence; ring 40 is Lenient. The band is a property of the size.
  state.entries[NO_9.key].sizeVariants = NO_9.sizeVariants.map(variant => ({
    ...variant,
    practicalLines: ['Single cigar', 'Uncut', 'Protected',
      variant.ring >= 41 ? 'Forgiving Cadence' : 'Lenient Cadence']
  }));
  state.cards[NO_9.key] = state.entries[NO_9.key];
  api.setVariantState(state);

  const card = cardOf(dom, NO_9.key);
  api.selectVariant(NO_9.key, 'short-panatela');
  let lines = [...card.querySelectorAll('.artmeta-right .artmeta-line')].map(node => node.textContent);
  assert.deepEqual(lines, ['Single cigar', 'Uncut', 'Protected', 'Lenient Cadence']);
  assert.equal(card.querySelector('.artmeta-right .artmeta-title').textContent, 'Practical');

  api.selectVariant(NO_9.key, 'petit-corona');
  lines = [...card.querySelectorAll('.artmeta-right .artmeta-line')].map(node => node.textContent);
  assert.deepEqual(lines, ['Single cigar', 'Uncut', 'Protected', 'Forgiving Cadence']);
});

test('a size can carry its own eyebrow caption while keeping the entry rank', async () => {
  const dom = mount();
  const api = await runtime();
  const state = STATE();
  state.entries[NO_9.key].sizeVariants = NO_9.sizeVariants.map(variant => ({
    ...variant,
    eyebrow: variant.id === 'short-panatela' ? 'Best exact No. 9 taster' : 'Fullest-ring exact No. 9 short'
  }));
  state.cards[NO_9.key] = state.entries[NO_9.key];
  api.setVariantState(state);

  const card = cardOf(dom, NO_9.key);
  api.selectVariant(NO_9.key, 'short-panatela');
  assert.equal(card.querySelector('.eyebrow').textContent, 'No. 7 — Best exact No. 9 taster');
  api.selectVariant(NO_9.key, 'petit-corona');
  assert.equal(card.querySelector('.eyebrow').textContent, 'No. 7 — Fullest-ring exact No. 9 short');
});


test('selecting a size switches stock and freshness metadata with the vitola', async () => {
  const dom = mount();
  const api = await runtime();
  const state = STATE();
  const variants = state.entries[NO_9.key].sizeVariants.map(variant => variant.id === 'short-panatela'
    ? { ...variant, stock: 'out', priceChecked: '2026-09-20', stockChecked: '2026-09-20' }
    : variant.id === 'petit-corona'
      ? { ...variant, stock: 'in', priceChecked: '2026-09-19', stockChecked: '2026-09-19' }
      : variant);
  state.entries[NO_9.key] = { ...state.entries[NO_9.key], sizeVariants: variants };
  state.cards[NO_9.key] = state.entries[NO_9.key];
  api.setVariantState(state);

  const card = cardOf(dom, NO_9.key);
  let events = 0;
  card.addEventListener('catalogue:variant-changed', () => { events += 1; });

  api.selectVariant(NO_9.key, 'short-panatela');
  assert.equal(card.dataset.stock, 'out');
  assert.equal(card.dataset.priceChecked, '2026-09-20');
  assert.equal(card.dataset.stockChecked, '2026-09-20');
  assert.match(card.querySelector('.stock-state').textContent, /Out of stock/);

  api.selectVariant(NO_9.key, 'petit-corona');
  assert.equal(card.dataset.stock, 'in');
  assert.equal(card.dataset.priceChecked, '2026-09-19');
  assert.match(card.querySelector('.stock-state').textContent, /In stock/);
  assert.equal(events, 2);
});
