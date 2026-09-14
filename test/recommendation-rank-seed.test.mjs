import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecommendationRankSeed } from '../scripts/seed-live-recommendation-ranks.mjs';

function card(key, { rank, type = 'main', ring = 32, production = 'Handmade', classes = 'card' } = {}) {
  return `<article class="${classes}" data-key="${key}" data-rank="${rank}" data-catalogue-type="${type}">
    <div class="artframe" data-visual-ring="${ring}"></div>
    <div class="artmeta-left"><span class="artmeta-line">${production}</span></div>
  </article>`;
}

function baseState() {
  return {
    version: 3,
    sections: { introHtml: '<p>Do not touch me</p>' },
    cards: {
      'joya-black-cigarillo': {
        title: 'JOYA Black Cigarillos — Pack of 10',
        eyebrow: 'Sweet San Andrés quick-smoke candidate',
        summaryHtml: '<strong>Cocoa</strong> full-flavoured traditional cigar.',
        rank: 7,
        strength: 6,
        quality: 7,
        price: 11.9,
        retailerLinks: ['https://example.test/joya']
      },
      'traditional-coronet': { title: 'Traditional Coronet', rank: 2, quality: 8 },
      'petit-a': { title: 'Petit A', rank: 1, quality: 8 },
      'flavoured-a': { title: 'Flavoured A', rank: 5, quality: 8 },
      'flavoured-b': { title: 'Flavoured B', rank: 3, quality: 8 },
      'half-a': { title: 'Half A', rank: 1, catalogueType: 'half' },
      'taster-a': { title: 'Taster A', rank: 1, catalogueType: 'taster', taster: true },
      'archived-a': { title: 'Archived A', archived: true, archivedRank: 9 },
      'out-a': { title: 'Out A', rank: 4, stockPin: 'out' }
    },
    entries: {
      'joya-black-cigarillo': {
        brand: 'Joya de Nicaragua',
        ring: 32,
        productionLines: ['Handmade in Nicaragua', 'Wrapper: Mexican San Andrés', 'Binder: Nicaraguan', 'Filler: Nicaraguan']
      },
      'traditional-coronet': { brand: 'A', ring: 34 },
      'petit-a': { brand: 'B', ring: 38 },
      'flavoured-a': { brand: 'C', ring: 40, productionLines: ['Flavoured', 'Handmade'] },
      'flavoured-b': { brand: 'D', ring: 30, productionLines: ['Infused with coffee'] },
      'half-a': { brand: 'H', ring: 50, catalogueType: 'half', taster: false },
      'taster-a': { brand: 'T', ring: 40, taster: true },
      'archived-a': { brand: 'X', ring: 32, archived: true },
      'out-a': { brand: 'O', ring: 32 }
    }
  };
}

function liveHtml() {
  return [
    card('petit-a', { rank: 1, ring: 38 }),
    card('traditional-coronet', { rank: 2, ring: 34 }),
    card('flavoured-b', { rank: 3, ring: 30, production: 'Infused with coffee' }),
    card('out-a', { rank: 4, ring: 32, classes: 'card is-unavailable' }),
    card('flavoured-a', { rank: 5, ring: 40, production: 'Flavoured' }),
    card('joya-black-cigarillo', { rank: 7, ring: 32, production: 'Handmade in Nicaragua Wrapper: Mexican San Andrés Binder: Nicaraguan Filler: Nicaraguan' }),
    card('half-a', { rank: 1, type: 'half', ring: 50 }),
    card('taster-a', { rank: 1, type: 'taster', ring: 40 }),
    `<article class="card" data-key="archived-a" data-archived="1" data-archived-rank="9"><div class="artframe" data-visual-ring="32"></div></article>`
  ].join('\n');
}

test('seeds independent contiguous recommendation ranks while preserving fallback order', () => {
  const before = baseState();
  const result = buildRecommendationRankSeed(before, liveHtml());

  assert.deepEqual(result.rankings.coronets.map(row => [row.key, row.rank]), [
    ['traditional-coronet', 1],
    ['joya-black-cigarillo', 2]
  ]);
  assert.deepEqual(result.rankings['petit-panatelas'].map(row => [row.key, row.rank]), [
    ['petit-a', 1]
  ]);
  assert.deepEqual(result.rankings.flavoured.map(row => [row.key, row.rank]), [
    ['flavoured-b', 1],
    ['flavoured-a', 2]
  ]);

  assert.equal(result.state.cards['joya-black-cigarillo'].recommendationCohort, 'coronets');
  assert.equal(result.state.cards['joya-black-cigarillo'].recommendationRank, 2);
});

test('seed changes only recommendationCohort and recommendationRank fields', () => {
  const before = baseState();
  const snapshot = structuredClone(before);
  const result = buildRecommendationRankSeed(before, liveHtml());

  assert.deepEqual(before, snapshot, 'input state must not be mutated');
  assert.deepEqual(result.state.sections, snapshot.sections);
  assert.deepEqual(result.state.entries, snapshot.entries);

  for (const [key, original] of Object.entries(snapshot.cards)) {
    const next = { ...(result.state.cards[key] || {}) };
    delete next.recommendationCohort;
    delete next.recommendationRank;
    const cleanOriginal = { ...original };
    delete cleanOriginal.recommendationCohort;
    delete cleanOriginal.recommendationRank;
    assert.deepEqual(next, cleanOriginal, `non-ranking fields changed for ${key}`);
  }

  assert.equal(result.state.cards['joya-black-cigarillo'].title, 'JOYA Black Cigarillos — Pack of 10');
  assert.equal(result.state.cards['joya-black-cigarillo'].eyebrow, 'Sweet San Andrés quick-smoke candidate');
  assert.equal(result.state.cards['joya-black-cigarillo'].rank, 7);
  assert.equal(result.state.cards['half-a'].rank, 1);
  assert.equal(result.state.cards['taster-a'].rank, 1);
});

test('does not add recommendation metadata to half, taster, archived, or unavailable cards', () => {
  const result = buildRecommendationRankSeed(baseState(), liveHtml());
  for (const key of ['half-a', 'taster-a', 'archived-a', 'out-a']) {
    assert.equal(Object.hasOwn(result.state.cards[key], 'recommendationCohort'), false, key);
    assert.equal(Object.hasOwn(result.state.cards[key], 'recommendationRank'), false, key);
  }
});

test('valid saved subsection ranks beat legacy global rank but never leak across cohorts', () => {
  const state = baseState();
  state.cards['traditional-coronet'].recommendationCohort = 'coronets';
  state.cards['traditional-coronet'].recommendationRank = 2;
  state.cards['joya-black-cigarillo'].recommendationCohort = 'coronets';
  state.cards['joya-black-cigarillo'].recommendationRank = 1;
  state.cards['flavoured-a'].recommendationCohort = 'coronets';
  state.cards['flavoured-a'].recommendationRank = 1;

  const result = buildRecommendationRankSeed(state, liveHtml());
  assert.deepEqual(result.rankings.coronets.map(row => row.key), [
    'joya-black-cigarillo',
    'traditional-coronet'
  ]);
  assert.deepEqual(result.rankings.flavoured.map(row => row.key), [
    'flavoured-b',
    'flavoured-a'
  ]);
  assert.equal(result.state.cards['flavoured-a'].recommendationCohort, 'flavoured');
  assert.equal(result.state.cards['flavoured-a'].recommendationRank, 2);
});
