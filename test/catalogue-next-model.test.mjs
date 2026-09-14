import test from 'node:test';
import assert from 'node:assert/strict';

import {
  brandGroups,
  recommendationLocation,
  moveRecommendationEntry,
  moveRankedCohort,
  mergeSparseCardPatch,
  editablePatch
} from '../public/catalogue-next-model.mjs';

test('brandGroups groups only exact normalized brand names and preserves rows', () => {
  const rows = [
    { key: 'a', brand: 'Drew Estate' },
    { key: 'b', brand: 'Drew Estate' },
    { key: 'c', brand: 'Drew Estate / Joya' },
    { key: 'd', brand: 'Oliva' }
  ];
  const groups = brandGroups(rows);
  assert.deepEqual(groups.get('Drew Estate').map(row => row.key), ['a', 'b']);
  assert.deepEqual(groups.get('Drew Estate / Joya').map(row => row.key), ['c']);
  assert.deepEqual(groups.get('Oliva').map(row => row.key), ['d']);
});

test('recommendationLocation reads explicit v4 subsection membership', () => {
  const state = {
    version: 4,
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['joya-black-cigarillo', 'm81'] },
      { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: ['lp9'] }
    ]
  };
  assert.deepEqual(recommendationLocation('joya-black-cigarillo', state), { subsectionId: 'coronets', index: 0 });
  assert.deepEqual(recommendationLocation('lp9', state), { subsectionId: 'petit-panatelas', index: 0 });
  assert.equal(recommendationLocation('missing', state), null);
});

test('moveRecommendationEntry reorders only explicit recommendation subsection entryKeys', () => {
  const state = {
    version: 4,
    cards: { a: { eyebrow: 'Keep me' }, h: { catalogueType: 'half', rank: 1 } },
    entries: {},
    sections: { keep: { title: 'Keep' } },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a', 'b', 'c'] },
      { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: ['d', 'e'] }
    ]
  };
  const next = moveRecommendationEntry(state, 'c', 'coronets', 0);
  assert.deepEqual(next.recommendationSubsections[0].entryKeys, ['c', 'a', 'b']);
  assert.deepEqual(next.recommendationSubsections[1].entryKeys, ['d', 'e']);
  assert.equal(next.cards.a.eyebrow, 'Keep me');
  assert.equal(next.cards.h.rank, 1);
  assert.deepEqual(next.sections, state.sections);
});

test('moveRecommendationEntry moves a main card between subsections without touching cigar prose', () => {
  const state = {
    version: 4,
    cards: { a: { eyebrow: 'Elite coronet', summaryHtml: '<strong>Dense smoke</strong>' } },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a', 'b'] },
      { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: ['c'] }
    ]
  };
  const next = moveRecommendationEntry(state, 'a', 'flavoured', 1);
  assert.deepEqual(next.recommendationSubsections[0].entryKeys, ['b']);
  assert.deepEqual(next.recommendationSubsections[1].entryKeys, ['c', 'a']);
  assert.equal(next.cards.a.eyebrow, 'Elite coronet');
  assert.equal(next.cards.a.summaryHtml, '<strong>Dense smoke</strong>');
});

test('moveRankedCohort renumbers only the requested Half-Cigar or Taster cohort contiguously', () => {
  const rows = [
    { key: 'm1', catalogueType: 'main', rank: 9 },
    { key: 'h1', catalogueType: 'half', rank: 1 },
    { key: 'h2', catalogueType: 'half', rank: 2 },
    { key: 't1', catalogueType: 'taster', rank: 1 },
    { key: 't2', catalogueType: 'taster', rank: 2 }
  ];
  const half = moveRankedCohort(rows, 'h2', 0, 'half');
  assert.deepEqual(half.filter(row => row.catalogueType === 'half').map(row => [row.key, row.rank]), [['h2', 1], ['h1', 2]]);
  assert.equal(half.find(row => row.key === 't1').rank, 1);
  assert.equal(half.find(row => row.key === 'm1').rank, 9);

  const taster = moveRankedCohort(rows, 't2', 0, 'taster');
  assert.deepEqual(taster.filter(row => row.catalogueType === 'taster').map(row => [row.key, row.rank]), [['t2', 1], ['t1', 2]]);
  assert.equal(taster.find(row => row.key === 'h1').rank, 1);
});

test('mergeSparseCardPatch preserves unrelated state and strips direct derived value writes', () => {
  const state = {
    version: 4,
    cards: { a: { eyebrow: 'Keep', quality: 8, value: 3 }, b: { rank: 2 } },
    entries: { dyn: { brand: 'X' } },
    sections: { benchmarksHtml: '<details>Keep</details>' },
    recommendationSubsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] }]
  };
  const next = mergeSparseCardPatch(state, 'a', { quality: 9, value: 1 });
  assert.equal(next.cards.a.quality, 9);
  assert.equal(next.cards.a.eyebrow, 'Keep');
  assert.equal(Object.hasOwn(next.cards.a, 'value'), false);
  assert.deepEqual(next.cards.b, { rank: 2 });
  assert.deepEqual(next.entries, state.entries);
  assert.deepEqual(next.sections, state.sections);
  assert.deepEqual(next.recommendationSubsections, state.recommendationSubsections);
});

test('editablePatch refuses direct Value editing and leaves eyebrow untouched for rank changes', () => {
  assert.throws(() => editablePatch('value', 'gold', {}), /derived/i);
  assert.deepEqual(editablePatch('rank', 3, { eyebrow: 'Sublime smoke' }), { rank: 3 });
  assert.deepEqual(editablePatch('eyebrow', 'Elite / Sublime', {}), { eyebrow: 'Elite / Sublime' });
});
