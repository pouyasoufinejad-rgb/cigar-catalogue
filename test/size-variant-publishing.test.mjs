import test from 'node:test';
import assert from 'node:assert/strict';

import { publishRequestDocument } from '../scripts/publish-catalogue-request.mjs';
import { normaliseEntry } from '../src/index.js';
import {
  defaultBlendVariantId,
  defaultVariantId,
  normaliseBlendVariants,
  normaliseVariants
} from '../public/catalogue-variants.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const TOKEN = 'test-token-do-not-log';

const VARIANTS = [
  {
    id: 'short-panatela', label: 'Short Panatela', title: 'No. 9 Short Panatela Oscuro',
    length: 4.5, ring: 40, packagePrice: 37, packageLabel: 'single cigar',
    retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9-short-panatela-oscuro/'],
    smokeTime: '35–50 min smoke',
    practicalLines: ['Single cigar', 'Uncut', 'Protected', 'Lenient Cadence']
  },
  {
    id: 'petit-corona', label: 'Petit Corona', title: 'No. 9 Petit Corona Oscuro',
    length: 4.25, ring: 46, packagePrice: 44, packageLabel: 'single cigar',
    retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9-petit-corona-oscuro/'],
    smokeTime: '40–55 min smoke',
    practicalLines: ['Single cigar', 'Uncut', 'Protected', 'Forgiving Cadence']
  },
  { id: 'toro', label: 'Toro', title: 'No. 9 Toro', length: 6, ring: 52 }
];

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

// A stand-in for the Worker: it normalises a stored entry exactly as production does, which
// is the step that would silently drop a field the schema does not name.
function publishHarness(key, existingState) {
  const state = existingState;
  let savedEntry = null;
  let writtenState = null;
  const routes = new Map();

  const router = async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const href = String(url);
    if (method === 'GET' && href === `${BASE}/api/catalogue-overrides`) return jsonResponse(state);
    if (method === 'PUT' && href === `${BASE}/api/catalogue-entry/${key}`) {
      savedEntry = normaliseEntry(JSON.parse(options.body), key);
      return jsonResponse({ ok: true, entry: savedEntry });
    }
    if (method === 'PUT' && href === `${BASE}/api/catalogue-overrides`) {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    }
    if (method === 'GET' && href === `${BASE}/api/catalogue-entry/${key}`) return jsonResponse(savedEntry);
    if (method === 'GET' && href.startsWith(`${BASE}/api/catalogue-overrides?verify=`)) {
      // The read-back must echo the sections the publisher just wrote, or its own
      // subsection-membership check fails on the harness rather than on the change.
      return jsonResponse({
        ...state,
        cards: writtenState.cards,
        sections: writtenState.sections,
        entries: savedEntry ? { ...(state.entries || {}), [key]: savedEntry } : (state.entries || {})
      });
    }
    if (method === 'GET' && href.startsWith(`${BASE}/?catalogue_verify=`)) {
      return new Response(`<article class="card" data-key="${key}"></article>`,
        { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (method === 'PUT' && href.startsWith(`${BASE}/api/catalogue-entry/`)) {
      return jsonResponse({ ok: true });
    }
    throw new Error(`Unexpected request: ${method} ${href}`);
  };
  void routes;
  return { router, saved: () => savedEntry, written: () => writtenState };
}

test('a publish carries every size through to the stored entry and card', async () => {
  const key = 'liga-privada-no-9-petit-corona-oscuro';
  const harness = publishHarness(key, { version: 3, cards: {}, sections: {}, entries: {} });

  await publishRequestDocument({
    operation: 'upsert-entry',
    key,
    entry: {
      brand: 'Liga Privada', title: 'No. 9 Petit Corona Oscuro', eyebrow: 'Exact No. 9',
      rank: 6, quality: 9, strength: 8, country: 'Nicaragua',
      length: 4.25, ring: 46, packagePrice: 44, packageLabel: 'single cigar', price: 44,
      sizeVariants: VARIANTS, defaultVariantId: 'short-panatela'
    }
  }, { fetchImpl: harness.router, baseUrl: BASE, token: TOKEN, repoRoot: process.cwd() });

  const entry = harness.saved();
  assert.ok(entry, 'the entry should have been written');
  assert.deepEqual(entry.sizeVariants.map(variant => variant.id),
    ['short-panatela', 'petit-corona', 'toro'], 'every size reaches KV');
  assert.equal(entry.defaultVariantId, 'short-panatela');
  // Per-size data must survive, not just the ids.
  const short = entry.sizeVariants[0];
  assert.equal(short.price, 37);
  assert.equal(short.ring, 40);
  assert.deepEqual(short.practicalLines, ['Single cigar', 'Uncut', 'Protected', 'Lenient Cadence']);
  assert.equal(entry.sizeVariants[2].priceUnverified, true, 'an unpriced size stays unpriced');

  const card = harness.written().cards[key];
  assert.ok(card, 'the card override should have been written');
  assert.equal(defaultVariantId(card), 'short-panatela');
  assert.equal(normaliseVariants(card).length, 3, 'the card keeps the sizes too');
});

test('archiving the consolidated card leaves no second standalone entry for the same cigar', async () => {
  const parent = 'liga-privada-no-9-petit-corona-oscuro';
  const absorbed = 'liga-privada-no-9-short-panatela';
  const state = {
    version: 3,
    sections: {},
    entries: {
      [parent]: {
        key: parent, brand: 'Liga Privada', title: 'No. 9 Petit Corona Oscuro',
        rank: 6, quality: 9, strength: 8, length: 4.25, ring: 46,
        packagePrice: 44, packageLabel: 'single cigar', price: 44,
        sizeVariants: VARIANTS, defaultVariantId: 'short-panatela'
      }
    },
    cards: {
      [parent]: { rank: 6, archived: false, sizeVariants: VARIANTS, defaultVariantId: 'short-panatela' },
      [absorbed]: { rank: 7, archived: false, brand: 'Liga Privada', title: 'No. 9 Short Panatela Oscuro' }
    }
  };
  const harness = publishHarness(absorbed, state);

  await publishRequestDocument({ operation: 'archive-entry', key: absorbed },
    { fetchImpl: harness.router, baseUrl: BASE, token: TOKEN, repoRoot: process.cwd() });

  const cards = harness.written().cards;
  assert.equal(cards[absorbed].archived, true, 'the absorbed card is archived, not deleted');
  assert.ok(cards[absorbed].archivedRank, 'its rank is remembered so it can be restored');
  assert.equal(cards[parent].archived, false, 'the surviving entry stays active');

  // Exactly one active card now speaks for this cigar. The publisher also merges the repo's
  // static catalogue into state.cards, so the check is scoped to cards claiming this
  // cigar's identity rather than to the catalogue as a whole.
  const activeShortPanatelas = Object.entries(cards).filter(([cardKey, card]) =>
    !card.archived && (cardKey === absorbed || /No\. 9 Short Panatela/i.test(String(card.title || ''))));
  assert.deepEqual(activeShortPanatelas, [], 'no standalone Short Panatela card survives');
  assert.equal(cards[parent].archived, false, 'the entry that absorbed it is the one left standing');
  assert.equal(normaliseVariants(cards[parent]).length, 3);
  assert.ok(normaliseVariants(cards[parent]).some(variant => variant.id === 'short-panatela'),
    'the archived card lives on as a size of the surviving entry');
});


test('a publish carries blend variants through to the stored entry and card', async () => {
  const key = 'rocky-patel-sun-grown-juniors';
  const blends = [
    { id: 'sun-grown', label: 'Sun Grown' },
    {
      id: 'maduro', label: 'Maduro', title: 'Sun Grown Maduro Robusto',
      length: 5, ring: 50, packagePrice: 47.3, packageLabel: 'single cigar',
      strength: 8, quality: 9, flavour: null,
      productionLines: ['Wrapper: Broadleaf Maduro', 'Binder: Nicaraguan', 'Filler: Nicaraguan'],
      practicalLines: ['Single cigar', 'Uncut', 'Protected', 'Forgiving Cadence'],
      retailerLinks: ['https://www.theindexcigars.com.au/products/sun-grown-maduro-robusto']
    }
  ];
  const harness = publishHarness(key, { version: 3, cards: {}, sections: {}, entries: {} });

  await publishRequestDocument({
    operation: 'upsert-entry',
    key,
    entry: {
      brand: 'Rocky Patel', title: 'Sun Grown Juniors', eyebrow: 'Sun Grown',
      rank: 4, quality: 8, strength: 9, country: 'Honduras',
      length: 4, ring: 38, packagePrice: 85, packageLabel: 'pack of 5', price: 17,
      blendVariants: blends, defaultBlendVariantId: 'sun-grown'
    }
  }, { fetchImpl: harness.router, baseUrl: BASE, token: TOKEN, repoRoot: process.cwd() });

  const entry = harness.saved();
  assert.deepEqual(normaliseBlendVariants(entry).map(variant => variant.id), ['sun-grown', 'maduro']);
  assert.equal(defaultBlendVariantId(entry), 'sun-grown');
  assert.equal(entry.blendVariants[1].quality, 9);
  assert.deepEqual(entry.blendVariants[1].productionLines,
    ['Wrapper: Broadleaf Maduro', 'Binder: Nicaraguan', 'Filler: Nicaraguan']);

  const card = harness.written().cards[key];
  assert.deepEqual(normaliseBlendVariants(card).map(variant => variant.id), ['sun-grown', 'maduro']);
  assert.equal(defaultBlendVariantId(card), 'sun-grown');
});
