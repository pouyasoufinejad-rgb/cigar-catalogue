import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  recommendationRankCohort,
  textLooksFlavoured,
  recommendationFlavourCohortEligible,
  rankRecommendationRows,
  preserveGlobalRanksForRecommendationEdit
} from '../public/catalogue-recommendation-cohorts.mjs';

const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const cohortSource = await readFile(new URL('../public/catalogue-recommendation-cohorts.mjs', import.meta.url), 'utf8');

const KFC_SWEET_PONIES = 'kfc-ponies-sweets';

test('recommendation cohorts use the 34 RG boundary and flavoured override', () => {
  assert.equal(recommendationRankCohort({ recommendation: true, ring: 34, flavoured: false }), 'coronets');
  assert.equal(recommendationRankCohort({ recommendation: true, ring: 35, flavoured: false }), 'petit-panatelas');
  assert.equal(recommendationRankCohort({ recommendation: true, ring: 26, flavoured: true }), 'flavoured');
  assert.equal(recommendationRankCohort({ recommendation: false, ring: 32, flavoured: false }), '');
  assert.equal(textLooksFlavoured('Wrapper: Maduro · Infused'), true);
  assert.equal(textLooksFlavoured('Flavoured'), true);
  assert.equal(textLooksFlavoured('Traditional long filler'), false);
});

test('KFC Sweet Ponies is explicitly excluded from the infused/flavoured subsection', () => {
  assert.equal(recommendationFlavourCohortEligible({
    key: KFC_SWEET_PONIES,
    text: 'Flavoured / Sweetened'
  }), false);
  assert.equal(recommendationFlavourCohortEligible({
    key: 'tabak-especial-dark-roast',
    text: 'Infused'
  }), true);
  assert.equal(recommendationRankCohort({ recommendation: true, ring: 32, flavoured: false }), 'coronets');
});

test('recommendation subsection rankings are contiguous and independent', () => {
  const ranked = rankRecommendationRows([
    { key: 'coronet-a', cohort: 'coronets', legacyRank: 1 },
    { key: 'petit-a', cohort: 'petit-panatelas', legacyRank: 2 },
    { key: 'flavour-a', cohort: 'flavoured', legacyRank: 3 },
    { key: 'coronet-b', cohort: 'coronets', legacyRank: 4 },
    { key: 'petit-b', cohort: 'petit-panatelas', legacyRank: 5 },
    { key: 'flavour-b', cohort: 'flavoured', legacyRank: 6 }
  ]);

  assert.deepEqual(ranked['coronet-a'], { cohort: 'coronets', rank: 1 });
  assert.deepEqual(ranked['coronet-b'], { cohort: 'coronets', rank: 2 });
  assert.deepEqual(ranked['petit-a'], { cohort: 'petit-panatelas', rank: 1 });
  assert.deepEqual(ranked['petit-b'], { cohort: 'petit-panatelas', rank: 2 });
  assert.deepEqual(ranked['flavour-a'], { cohort: 'flavoured', rank: 1 });
  assert.deepEqual(ranked['flavour-b'], { cohort: 'flavoured', rank: 2 });
});

test('editing a recommendation rank reorders only its own subsection', () => {
  const ranked = rankRecommendationRows([
    { key: 'coronet-a', cohort: 'coronets', recommendationRank: 1, legacyRank: 1 },
    { key: 'coronet-b', cohort: 'coronets', recommendationRank: 2, legacyRank: 4 },
    { key: 'petit-a', cohort: 'petit-panatelas', recommendationRank: 1, legacyRank: 2 },
    { key: 'petit-b', cohort: 'petit-panatelas', recommendationRank: 2, legacyRank: 5 }
  ], { selectedKey: 'coronet-b', selectedRank: 1 });

  assert.equal(ranked['coronet-b'].rank, 1);
  assert.equal(ranked['coronet-a'].rank, 2);
  assert.equal(ranked['petit-a'].rank, 1);
  assert.equal(ranked['petit-b'].rank, 2);
});

test('local recommendation rank edits preserve the legacy global ranks', () => {
  const preserved = preserveGlobalRanksForRecommendationEdit({
    'coronet-a': { rank: 1, quality: 8 },
    'coronet-b': { rank: 2, quality: 7 },
    'unrelated': { rank: 3, quality: 6 }
  }, {
    'coronet-a': 9,
    'coronet-b': 12
  });

  assert.equal(preserved['coronet-a'].rank, 9);
  assert.equal(preserved['coronet-b'].rank, 12);
  assert.equal(preserved.unrelated.rank, 3);
  assert.equal(preserved['coronet-a'].quality, 8);
});

test('the infused/flavoured cohort reuses the old existing subsection instead of cloning another one', () => {
  assert.match(cohortSource, /data-noteworthy-section=[\\"']neither[\\"']/);
  assert.doesNotMatch(cohortSource, /cloneNode\s*\(/);
});

test('half cigars, tasters and non-recommendations have no recommendation cohort', () => {
  assert.equal(recommendationRankCohort({ recommendation: false, ring: 34, flavoured: false }), '');
  const ranked = rankRecommendationRows([
    { key: 'coronet', cohort: 'coronets', legacyRank: 1 },
    { key: 'half', cohort: '', legacyRank: 1 },
    { key: 'taster', cohort: '', legacyRank: 1 },
    { key: 'noteworthy', cohort: '', legacyRank: 2 }
  ]);
  assert.deepEqual(Object.keys(ranked), ['coronet']);
});

test('browser runtime loads the recommendation cohort controller', () => {
  assert.match(runtimeSource, /import\('\.\/catalogue-recommendation-cohorts\.mjs'\)/);
  assert.doesNotMatch(runtimeSource, /catalogue-recommendation-subsections\.mjs/);
});

test('recommendation rank rendering leaves editable eyebrow copy untouched', () => {
  assert.doesNotMatch(cohortSource, /querySelector\?\.\(['\"]\.eyebrow['\"]\)/);
  assert.match(cohortSource, /dataset\.recommendationRank/);
});
