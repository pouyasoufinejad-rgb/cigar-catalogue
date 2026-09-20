import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

import {
  defaultVariantId,
  matchVariantQuery,
  normaliseVariants,
  perStickPrice,
  promoteVariantPatch,
  resolveSearchQuery,
  resolveVariantId,
  variantEffectiveRecord
} from '../public/catalogue-variants.mjs';
import { normaliseEntry, renderEntryCard } from '../src/index.js';
import { deriveValue } from '../public/catalogue-value.mjs';
import { deriveOverallScore } from '../public/catalogue-overall-score.mjs';

const NO_9 = Object.freeze({
  key: 'liga-privada-no-9-petit-corona-oscuro',
  brand: 'Liga Privada',
  title: 'No. 9 Petit Corona Oscuro',
  eyebrow: 'Fullest-ring exact No. 9 short',
  country: 'Nicaragua',
  strength: 8, quality: 9, flavour: 8, risk: 1, rank: 7,
  length: 4.25, ring: 46, packagePrice: 44, packageLabel: 'single cigar', price: 44,
  summaryHtml: '<strong>Espresso and dark cocoa.</strong>',
  productionLines: ['Handmade', 'Wrapper: Connecticut River Valley Broadleaf Oscuro'],
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
    {
      id: 'toro', label: 'Toro', title: 'No. 9 Toro', length: 6, ring: 52,
      priceNote: 'Cigar Hut lists an 80-1799 range across every option on the page'
    }
  ]
});

const SINGLE_SIZE = Object.freeze({
  key: 'alonso-menendez-axe-charutos',
  brand: 'Alonso Menendez', title: 'Axe Charutos', eyebrow: 'Brazilian value benchmark',
  country: 'Brazil', strength: 6, quality: 6, flavour: 7, risk: 1, rank: 17,
  length: 4.6, ring: 35, packagePrice: 48, packageLabel: 'pack of 5', price: 9.6,
  summaryHtml: '<strong>Cedar and cocoa.</strong>',
  retailerLinks: ['https://www.cigarhut.com.au/alonso-menendez-axe-charutos/']
});

/* Variant data persistence */

test('variant data survives the entry schema, which drops anything it does not name', () => {
  const stored = normaliseEntry(NO_9, NO_9.key);
  assert.equal(stored.sizeVariants.length, 3);
  assert.equal(stored.defaultVariantId, 'petit-corona');
  assert.deepEqual(stored.sizeVariants.map(variant => variant.id),
    ['petit-corona', 'short-panatela', 'toro']);
  // Round-tripping is what a publish does, so it must be a fixed point.
  const again = normaliseEntry(stored, stored.key);
  assert.deepEqual(again.sizeVariants, stored.sizeVariants);
  assert.equal(again.defaultVariantId, 'petit-corona');
});

test('a malformed or duplicated variant is dropped rather than stored', () => {
  const messy = normaliseVariants({
    sizeVariants: [
      { label: 'Petit Corona', ring: 46 },
      { label: 'Petit Corona', ring: 46 },
      { label: '' },
      null,
      'not a variant'
    ]
  });
  assert.deepEqual(messy.map(variant => variant.id), ['petit-corona']);
});

/* Default versus active */

test('the catalogue first shows the saved default, not the first size in the list', () => {
  const resolved = variantEffectiveRecord({ ...NO_9, defaultVariantId: 'short-panatela' });
  assert.equal(resolved.variantId, 'short-panatela');
  assert.equal(resolved.record.title, 'No. 9 Short Panatela Oscuro');
});

test('selecting a size changes the view and leaves the saved default alone', () => {
  const record = { ...NO_9 };
  const active = variantEffectiveRecord(record, 'toro');
  assert.equal(active.variantId, 'toro');
  assert.equal(active.record.activeVariantId, 'toro');
  // The saved default is untouched, on the result and on the record it came from.
  assert.equal(active.record.defaultVariantId, 'petit-corona');
  assert.equal(record.defaultVariantId, 'petit-corona');
  assert.equal(defaultVariantId(record), 'petit-corona');
});

test('an unknown or missing variant id falls back to the default rather than failing', () => {
  assert.equal(resolveVariantId(NO_9, 'no-such-size'), 'petit-corona');
  assert.equal(resolveVariantId(NO_9, ''), 'petit-corona');
  assert.equal(variantEffectiveRecord(NO_9, 'nonsense').record.title, 'No. 9 Petit Corona Oscuro');
});

test('a saved default naming a size that no longer exists falls back to the first', () => {
  const orphaned = { ...NO_9, defaultVariantId: 'belicoso' };
  assert.equal(defaultVariantId(orphaned), 'petit-corona');
});

/* Changing the default */

test('promoting a size returns a patch that changes only the default', () => {
  const patch = promoteVariantPatch(NO_9, 'short-panatela');
  assert.deepEqual(patch, { defaultVariantId: 'short-panatela' });
  // Promoting the size that is already default writes nothing.
  assert.equal(promoteVariantPatch(NO_9, 'petit-corona'), null);
  // And an unknown size cannot become the default.
  assert.deepEqual(promoteVariantPatch(NO_9, 'belicoso'), null);
});

test('after promotion the promoted size is what the catalogue shows first', () => {
  const promoted = { ...NO_9, ...promoteVariantPatch(NO_9, 'toro') };
  assert.equal(variantEffectiveRecord(promoted).variantId, 'toro');
  assert.equal(variantEffectiveRecord(promoted).record.title, 'No. 9 Toro');
});

/* Selecting variants changes every field a vitola may change */

test('a selected size carries its own dimensions, package, price, links and smoke time', () => {
  const { record } = variantEffectiveRecord(NO_9, 'short-panatela');
  assert.equal(record.length, 4.5);
  assert.equal(record.ring, 40);
  assert.equal(record.price, 37);
  assert.equal(record.packagePrice, 37);
  assert.equal(record.smokeTime, '35–50 min smoke');
  assert.deepEqual(record.retailerLinks,
    ['https://www.cigarhut.com.au/liga-privada-no-9-short-panatela-oscuro/']);
});

test('blend and production data stay shared across sizes', () => {
  for (const id of ['petit-corona', 'short-panatela', 'toro']) {
    const { record } = variantEffectiveRecord(NO_9, id);
    assert.equal(record.strength, 8, `${id} strength`);
    assert.equal(record.quality, 9, `${id} quality`);
    assert.equal(record.flavour, 8, `${id} flavour`);
    assert.equal(record.country, 'Nicaragua', `${id} country`);
    assert.deepEqual(record.productionLines, NO_9.productionLines, `${id} production`);
  }
});

test('the Size medal follows the selected ring gauge instead of being restated', () => {
  assert.equal(variantEffectiveRecord(NO_9, 'petit-corona').record.size, 'gold');
  const narrow = variantEffectiveRecord({
    ...NO_9,
    sizeVariants: [{ id: 'cigarillo', label: 'Cigarillo', ring: 20, length: 4, packagePrice: 8 }]
  }, 'cigarillo');
  assert.equal(narrow.record.size, 'bronze', 'a 20 ring is not a Gold format');
});

test('Value is derived from the selected size, never carried on the variant', () => {
  const petit = variantEffectiveRecord(NO_9, 'petit-corona').record;
  const short = variantEffectiveRecord(NO_9, 'short-panatela').record;
  for (const record of [petit, short]) {
    assert.equal(record.value, undefined, 'no variant stores a Value score');
  }
  const petitValue = deriveValue(petit.price, petit.quality, petit.flavour,
    { length: petit.length, ring: petit.ring });
  const shortValue = deriveValue(short.price, short.quality, short.flavour,
    { length: short.length, ring: short.ring });
  // The cheaper stick is the better value, which is the automatic model doing the work.
  assert.ok(shortValue.score >= petitValue.score,
    `A$37 should not score worse than A$44 (${shortValue.score} vs ${petitValue.score})`);
});

/* Price and per-stick handling */

test('a per-stick price is derived from the package and its count', () => {
  // The three corrections the research file calls for.
  assert.equal(perStickPrice({ packagePrice: 104, packageCount: 4 }), 26);
  assert.equal(perStickPrice({ packagePrice: 105, packageCount: 5 }), 21);
  assert.equal(perStickPrice({ packagePrice: 42, packageCount: 1 }), 42);
  // An explicit per-stick price wins over the derivation.
  assert.equal(perStickPrice({ packagePrice: 104, packageCount: 4, price: 25 }), 25);
  // Nothing to go on yields nothing, not a zero masquerading as a price.
  assert.equal(perStickPrice({}), 0);
});

test('a size with only a retailer range carries no price and no Value', () => {
  const { record, variant } = variantEffectiveRecord(NO_9, 'toro');
  assert.equal(variant.priceUnverified, true);
  assert.equal(record.price, 0, 'it must not inherit the Petit Corona price');
  assert.equal(record.packagePrice, 0);
  assert.equal(record.priceUnverified, true);
});

test('an unpriced size renders an unrated Value rather than a bronze 1/10', () => {
  const html = renderEntryCard({ ...NO_9, defaultVariantId: 'toro' });
  assert.match(html, /class="rating value-unrated"/);
  assert.match(html, /<b>Unrated<\/b>/);
  assert.doesNotMatch(html, /<span>Value<\/span>[\s\S]{0,120}?1\/10/);
  assert.match(html, /data-price-unverified="1"/);
  // And the facts row shows no price at all rather than A$0.
  assert.doesNotMatch(html, /A\$0\b/);
});

test('an unrated Value is left out of the overall score instead of scored as zero', () => {
  const rated = deriveOverallScore({ strength: 8, quality: 9, flavour: 8, size: 9, value: 7 });
  const unpriced = deriveOverallScore({ strength: 8, quality: 9, flavour: 8, size: 9, value: null });
  assert.equal(unpriced.provisional, true);
  assert.deepEqual(unpriced.missing, ['value']);
  assert.ok(unpriced.score > 0);
  assert.ok(Math.abs(unpriced.score - rated.score) < 12,
    'dropping Value should rescale, not collapse the score');
});

/* Search resolves a size to its parent entry */

test('searching a vitola returns the parent entry with that size selected', () => {
  const hit = resolveSearchQuery('Liga No 9 Petit Corona', [NO_9, SINGLE_SIZE]);
  assert.equal(hit.key, 'liga-privada-no-9-petit-corona-oscuro');
  assert.equal(hit.variantId, 'petit-corona');

  const nested = resolveSearchQuery('no 9 short panatela', [NO_9, SINGLE_SIZE]);
  assert.equal(nested.key, 'liga-privada-no-9-petit-corona-oscuro',
    'a nested size resolves to its parent, not to a card of its own');
  assert.equal(nested.variantId, 'short-panatela');

  const toro = resolveSearchQuery('liga privada no 9 toro', [NO_9, SINGLE_SIZE]);
  assert.equal(toro.variantId, 'toro');
});

test('search still finds an entry that has no variants', () => {
  const hit = resolveSearchQuery('axe charutos', [NO_9, SINGLE_SIZE]);
  assert.equal(hit.key, 'alonso-menendez-axe-charutos');
  assert.equal(hit.variantId, '', 'nothing to select on a single-size entry');
});

test('a query matching nothing resolves to nothing rather than to the first card', () => {
  assert.equal(resolveSearchQuery('padron 1964', [NO_9, SINGLE_SIZE]), null);
  assert.deepEqual(matchVariantQuery('', [NO_9]), []);
});

/* Entries without variants keep working exactly as before */

test('an entry without variants renders no selector and is otherwise unchanged', () => {
  const html = renderEntryCard(SINGLE_SIZE);
  assert.doesNotMatch(html, /data-variant-select/);
  assert.doesNotMatch(html, /size-variants/);
  assert.doesNotMatch(html, /data-active-variant/);
  assert.match(html, /<b>A\$48<\/b><small>pack of 5<\/small>/);
  assert.match(html, /<b>A\$9\.60<\/b><small>per stick<\/small>/);
  assert.match(html, /<span>Value<\/span>/);
  assert.doesNotMatch(html, /value-unrated/);
});

test('variantEffectiveRecord is a pass-through for a record with no variants', () => {
  const resolved = variantEffectiveRecord(SINGLE_SIZE);
  assert.equal(resolved.variant, null);
  assert.equal(resolved.variantId, '');
  assert.deepEqual(resolved.variants, []);
  assert.equal(resolved.record.price, 9.6);
  assert.equal(resolved.record.activeVariantId, undefined);
});

test('a single-variant entry shows no selector, since there is nothing to choose', () => {
  const html = renderEntryCard({
    ...SINGLE_SIZE,
    sizeVariants: [{ id: 'only', label: 'Petit Corona', ring: 35, length: 4.6, packagePrice: 48, packageCount: 5 }]
  });
  assert.doesNotMatch(html, /data-variant-select/);
});

/* The rendered card */

test('a multi-size card renders a selector defaulted to the saved default', () => {
  const dom = new JSDOM(`<!doctype html><body>${renderEntryCard(NO_9)}</body>`);
  const document = dom.window.document;
  const select = document.querySelector('[data-variant-select]');
  assert.ok(select, 'a multi-size card gets a size control');
  assert.equal(select.dataset.variantSelect, NO_9.key);
  assert.deepEqual([...select.options].map(option => option.value),
    ['petit-corona', 'short-panatela', 'toro']);
  assert.equal(select.value, 'petit-corona');
  const card = document.querySelector('article.card');
  assert.equal(card.dataset.activeVariant, 'petit-corona');
  assert.equal(card.dataset.defaultVariant, 'petit-corona');
});

test('every vitola name is present in the rendered page so it can be found', () => {
  const html = renderEntryCard(NO_9);
  for (const label of ['Petit Corona', 'Short Panatela', 'Toro']) {
    assert.ok(html.includes(label), `${label} should appear in the rendered card`);
  }
});

/* Mobile rendering */

test('the size selector does not overflow a phone-width card', async () => {
  const pageHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const moduleSource = await readFile(new URL('../public/catalogue-variant-runtime.mjs', import.meta.url), 'utf8');
  const variantCss = moduleSource.match(/style\.textContent = `([\s\S]*?)`;/)[1];
  const pageCss = [...pageHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map(match => match[1]).join('\n')
    .replace(/[^{}]*\{[^{}]*base64[^{}]*\}/g, '');

  const dom = new JSDOM(
    `<!doctype html><html><head><style>${pageCss}\n${variantCss}</style></head>`
    + `<body><div class="grid">${renderEntryCard(NO_9)}</div></body></html>`);
  const select = dom.window.document.querySelector('.size-variant-select');
  assert.ok(select);
  const style = dom.window.getComputedStyle(select);
  // A fixed width would push the card sideways on a phone; it must be free to shrink.
  assert.equal(Number.parseFloat(style.minWidth), 0);
  assert.match(style.flex, /1 1 auto/);
  assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.size-variants')).display, 'flex');
  // And the phone rule releases the desktop cap so the control fills the card.
  assert.match(variantCss, /@media\(max-width:900px\)\{[^}]*\.size-variant-select\{max-width:none\}/);
});
