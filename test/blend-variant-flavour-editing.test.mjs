// The Flavour score is the one rating a blend variant can carry that the parent entry
// schema does not. That asymmetric handling is where it goes missing, so these tests walk
// the whole round trip a person actually performs: open the editor on a blend, type a
// Flavour, save through the real state merge, and read the card back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mergeState, normaliseEntry, renderEntryCard } from '../src/index.js';
import { blendEffectiveRecord } from '../public/catalogue-variants.mjs';
import { updateBlendVariant } from '../public/catalogue-variant-edit-model.mjs';

globalThis.__CATALOGUE_VARIANT_TEST__ = true;

const CUBANITOS = Object.freeze({
  key: 'arturo-fuente-cubanitos-10',
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
  summaryHtml: '<strong>Chestnut and baking spice.</strong>',
  retailerLinks: ['https://www.cigarhut.com.au/arturo-fuente-cubanitos/'],
  blendVariants: [
    { id: 'natural', label: 'Natural' },
    {
      id: 'maduro',
      label: 'Maduro',
      title: 'Cubanitos Maduro',
      length: 4.5,
      ring: 32,
      packagePrice: 129,
      packageCount: 10,
      packageLabel: 'tin of 10',
      price: 12.9,
      country: 'DR',
      strength: 7,
      quality: 8,
      risk: 1,
      stock: 'in',
      productionLines: ['Wrapper: Connecticut Broadleaf'],
      practicalLines: ['Tin of 10'],
      smokeTime: '25–35 min smoke',
      summaryHtml: '<strong>Dark cocoa and molasses.</strong>',
      retailerLinks: ['https://www.cigarhut.com.au/arturo-fuente-cubanitos-maduro/']
    }
  ],
  defaultBlendVariantId: 'natural'
});

function stateWith(record) {
  return {
    version: 3,
    cards: { [record.key]: structuredClone(record) },
    sections: {},
    entries: { [record.key]: structuredClone(record) }
  };
}

// The editor writes the edited variant list into both buckets and PUTs the whole state.
function saveThroughWorker(record, blendId, patch) {
  const updated = updateBlendVariant(record, blendId, patch);
  const outgoing = stateWith(record);
  for (const bucket of ['cards', 'entries']) {
    outgoing[bucket][record.key].blendVariants = structuredClone(updated.blendVariants);
  }
  const merged = mergeState(stateWith(record), outgoing);
  return { key: record.key, ...merged.cards[record.key], ...merged.entries[record.key] };
}

test('a Flavour typed into the blend editor survives the save', () => {
  const saved = saveThroughWorker(CUBANITOS, 'maduro', { flavour: 9 });
  const maduro = saved.blendVariants.find(item => item.id === 'maduro');
  assert.equal(maduro.flavour, 9, 'the blend variant kept the Flavour it was given');
  assert.equal(blendEffectiveRecord(saved, 'maduro').record.flavour, 9);
});

test('clearing a blend Flavour stores the unrated state rather than dropping the field', () => {
  const rated = saveThroughWorker(CUBANITOS, 'maduro', { flavour: 9 });
  const cleared = saveThroughWorker(rated, 'maduro', { flavour: null });
  assert.equal(blendEffectiveRecord(cleared, 'maduro').record.flavour, null);
});

test('the parent entry keeps its own Flavour through a save', () => {
  const saved = saveThroughWorker(CUBANITOS, 'maduro', { flavour: 9 });
  assert.equal(saved.flavour, 7, 'editing a variant must not wipe the parent card rating');
});

test('normaliseEntry carries Flavour, so a server-rendered card can show it', () => {
  assert.equal(normaliseEntry(CUBANITOS, CUBANITOS.key).flavour, 7);
});

function render(record) {
  const dom = new JSDOM(`<!doctype html><html><body><div class="grid">${renderEntryCard(record)}</div></body></html>`);
  const card = dom.window.document.querySelector('article.card');
  const flavour = [...card.querySelectorAll('.rating')]
    .find(node => node.querySelector(':scope > span')?.textContent === 'Flavour');
  return {
    flavourSubscore: flavour?.querySelector('.subscore')?.textContent ?? null,
    overall: card.querySelector('.overall-score')?.textContent ?? null
  };
}

test('a served card carries its Flavour medal without waiting for scripts', () => {
  assert.equal(render(CUBANITOS).flavourSubscore, '7/10');
});

test('an unrated Flavour renders as Unrated rather than as a missing medal', () => {
  assert.equal(render({ ...CUBANITOS, flavour: null }).flavourSubscore, '\u2014');
});

// The complaint that started this: the score beside the flag did not move when Flavour did.
test('the overall score moves when the stored Flavour moves', () => {
  const low = render({ ...CUBANITOS, flavour: 3 }).overall;
  const high = render({ ...CUBANITOS, flavour: 9 }).overall;
  assert.ok(low && high, 'both cards rendered an overall score');
  assert.ok(Number(high) > Number(low), `expected ${high} to beat ${low}`);
});

test('promoting the Maduro blend to default renders its Flavour, not the parent\'s', () => {
  const saved = saveThroughWorker(CUBANITOS, 'maduro', { flavour: 9 });
  const promoted = { ...saved, defaultBlendVariantId: 'maduro' };
  assert.equal(render(promoted).flavourSubscore, '9/10');
  assert.ok(Number(render(promoted).overall) > Number(render(saved).overall));
});

// Flavour was the broken one, but a fix that leaves the neighbouring ratings unverified is
// how the next one goes unnoticed.
test('Strength, Quality and Risk edits on a blend variant also survive the save', () => {
  const saved = saveThroughWorker(CUBANITOS, 'maduro', { strength: 9, quality: 6, risk: 3 });
  const effective = blendEffectiveRecord(saved, 'maduro').record;
  assert.equal(effective.strength, 9);
  assert.equal(effective.quality, 6);
  assert.equal(effective.risk, 3);
});

test('editing one blend variant leaves the other blends alone', () => {
  const saved = saveThroughWorker(CUBANITOS, 'maduro', { flavour: 9, strength: 9 });
  const natural = blendEffectiveRecord(saved, 'natural').record;
  assert.equal(natural.strength, 6, 'the Natural kept the parent strength');
  assert.equal(natural.flavour, 7, 'the Natural kept the parent flavour');
  assert.equal(saved.blendVariants.length, 2, 'no blend was dropped');
});

test('a rating edit does not disturb the variant fields around it', () => {
  const saved = saveThroughWorker(CUBANITOS, 'maduro', { flavour: 9 });
  const maduro = blendEffectiveRecord(saved, 'maduro').record;
  assert.equal(maduro.price, 12.9);
  assert.equal(maduro.packageLabel, 'tin of 10');
  assert.deepEqual(maduro.productionLines, ['Wrapper: Connecticut Broadleaf']);
  assert.deepEqual(maduro.retailerLinks, ['https://www.cigarhut.com.au/arturo-fuente-cubanitos-maduro/']);
});

// The server now emits the medal the client used to inject. If the client's injector did
// not recognise it, every card would end up with two Flavour medals.
test('the client injector adopts the served Flavour medal instead of adding a second', async () => {
  const dom = new JSDOM(
    `<!doctype html><html><body><div class="grid">${renderEntryCard(CUBANITOS)}</div></body></html>`,
    { url: 'https://example.test/' }
  );
  for (const name of ['window', 'document', 'MutationObserver', 'Node', 'Element', 'HTMLElement', 'CSS']) {
    globalThis[name] = name === 'window' ? dom.window : dom.window[name];
  }
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

  const { ensureFlavourRating } = await import('../public/catalogue-flavour.mjs');
  const card = dom.window.document.querySelector('article.card');
  const flavourMedals = () => [...card.querySelectorAll('.rating')]
    .filter(node => node.querySelector(':scope > span')?.textContent === 'Flavour');

  assert.equal(flavourMedals().length, 1, 'the served card starts with exactly one');
  ensureFlavourRating(card, 9);
  assert.equal(flavourMedals().length, 1, 'and still has one after the client runs');
  assert.equal(flavourMedals()[0].querySelector('.subscore')?.textContent, '9/10');
});

// Clients merge the card override underneath the entry. An entry that always announced
// `flavour: null` would therefore blank a real score living on the card override.
test('an entry with no Flavour of its own does not shadow the card override', () => {
  const entry = normaliseEntry({ key: 'k', brand: 'B', title: 'T' }, 'k');
  assert.equal('flavour' in entry, false, 'the key is absent, not null');
  const asClientsMergeIt = { key: 'k', ...{ flavour: 8 }, ...entry };
  assert.equal(asClientsMergeIt.flavour, 8, 'the card override survives the merge');
});

test('an entry that states an unrated Flavour keeps saying so', () => {
  const entry = normaliseEntry({ key: 'k', brand: 'B', title: 'T', flavour: null }, 'k');
  assert.equal('flavour' in entry, true);
  assert.equal(entry.flavour, null);
});
