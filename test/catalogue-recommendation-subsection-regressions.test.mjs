import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  recommendationCohortForMainCard,
  rankRecommendationRows
} from '../public/catalogue-recommendation-cohorts.mjs';

const cohortSourceUrl = new URL('../public/catalogue-recommendation-cohorts.mjs', import.meta.url);

test('ordinary full-flavoured tasting prose does not classify Joya Black as infused or flavoured', () => {
  assert.equal(recommendationCohortForMainCard({
    key: 'joya-black-cigarillo',
    ring: 32,
    text: 'Medium-bodied but full-flavoured, with cocoa and pepper.',
    productionText: 'Handmade in Nicaragua Wrapper: Mexican San Andres Binder: Nicaraguan Filler: Nicaraguan'
  }), 'coronets');
});

test('structured production metadata still classifies genuinely infused cigars as flavoured', () => {
  assert.equal(recommendationCohortForMainCard({
    key: 'tabak-especial-cafecita-negra',
    ring: 32,
    text: 'Coffee, cocoa and sweet tobacco.',
    productionText: 'Infused Handmade in Nicaragua'
  }), 'flavoured');
});

test('a saved subsection rank is ignored after a cigar moves into a different subsection', () => {
  const ranked = rankRecommendationRows([
    {
      key: 'moved-to-coronets',
      cohort: 'coronets',
      persistedCohort: 'flavoured',
      recommendationRank: 1,
      legacyRank: 20
    },
    {
      key: 'existing-coronet',
      cohort: 'coronets',
      persistedCohort: 'coronets',
      recommendationRank: 2,
      legacyRank: 10
    }
  ]);

  assert.equal(ranked['existing-coronet'].rank, 1);
  assert.equal(ranked['moved-to-coronets'].rank, 2);
});

test('editing the rank field does not immediately refresh it back to the persisted subsection rank', async () => {
  const source = await readFile(cohortSourceUrl, 'utf8');
  assert.doesNotMatch(
    source,
    /getElementById\(['"]catalogue-admin-rank['"]\)\?\.addEventListener\(['"]change['"],\s*scheduleRefresh\)/
  );
});
