import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { legacyRecommendationCohortForCard } from '../public/catalogue-recommendation-legacy.mjs';
import { recommendationSubsectionsForState } from '../public/catalogue-recommendation-subsections.mjs';

const rendererSourceUrl = new URL('../public/catalogue-recommendation-subsections.mjs', import.meta.url);

test('ordinary full-flavoured tasting prose does not classify Joya Black as infused during v3 fallback', () => {
  assert.equal(legacyRecommendationCohortForCard({
    key: 'joya-black-cigarillo',
    catalogueType: 'main',
    ring: 32,
    text: 'Medium-bodied but full-flavoured, with cocoa and pepper.',
    productionText: 'Handmade in Nicaragua Wrapper: Mexican San Andres Binder: Nicaraguan Filler: Nicaraguan'
  }), 'coronets');
});

test('structured production metadata still identifies genuinely infused cigars during v3 fallback', () => {
  assert.equal(legacyRecommendationCohortForCard({
    key: 'tabak-especial-cafecita-negra',
    catalogueType: 'main',
    ring: 32,
    text: 'Coffee, cocoa and sweet tobacco.',
    productionText: 'Infused Handmade in Nicaragua'
  }), 'flavoured');
});

test('v4 placement overrides all old inferred and saved subsection metadata', () => {
  const explicit = [
    { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['moved'] },
    { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: [] }
  ];
  const result = recommendationSubsectionsForState({ version: 4, recommendationSubsections: explicit }, [
    {
      key: 'moved', catalogueType: 'main', ring: 50, productionText: 'Infused',
      recommendationCohort: 'flavoured', recommendationRank: 1, legacyRank: 20
    }
  ]);
  assert.deepEqual(result, explicit);
});

test('new renderer has no editor-rank mutation listener or structural save transform', async () => {
  const source = await readFile(rendererSourceUrl, 'utf8');
  assert.doesNotMatch(source, /catalogue-admin-rank[^\n]*addEventListener/);
  assert.doesNotMatch(source, /registerCatalogueStateTransform/);
  assert.doesNotMatch(source, /recommendation-subsection-ranks/);
});
