import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recommendationSubsectionFor,
  rankRecommendationSubsections
} from '../public/catalogue-recommendation-subsections.mjs';

test('recommendation subsection classification follows flavour and ring-gauge rules', () => {
  assert.equal(recommendationSubsectionFor({ ring: 34, flavoured: false }), 'coronets');
  assert.equal(recommendationSubsectionFor({ ring: 35, flavoured: false }), 'petit-panatelas');
  assert.equal(recommendationSubsectionFor({ ring: 26, flavoured: true }), 'infused-flavoured');
});

test('recommendation subsection ranks are independent and preserve prior relative order', () => {
  const rows = [
    { key: 'a', rank: 1, ring: 32, flavoured: false },
    { key: 'b', rank: 2, ring: 38, flavoured: false },
    { key: 'c', rank: 3, ring: 30, flavoured: true },
    { key: 'd', rank: 4, ring: 34, flavoured: false },
    { key: 'e', rank: 5, ring: 40, flavoured: false },
    { key: 'f', rank: 6, ring: 34, flavoured: true }
  ];

  const ranked = rankRecommendationSubsections(rows);
  const byKey = new Map(ranked.map(row => [row.key, row]));

  assert.deepEqual([byKey.get('a').subsectionRank, byKey.get('d').subsectionRank], [1, 2]);
  assert.deepEqual([byKey.get('b').subsectionRank, byKey.get('e').subsectionRank], [1, 2]);
  assert.deepEqual([byKey.get('c').subsectionRank, byKey.get('f').subsectionRank], [1, 2]);
});

test('half cigars and tasters are excluded from recommendation subsection ranking', () => {
  const ranked = rankRecommendationSubsections([
    { key: 'main', rank: 3, ring: 34, catalogueType: 'main', flavoured: false },
    { key: 'half', rank: 1, ring: 32, catalogueType: 'half', flavoured: false },
    { key: 'taster', rank: 1, ring: 40, catalogueType: 'taster', flavoured: false }
  ]);

  assert.deepEqual(ranked.map(row => row.key), ['main']);
});
