import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  legacyTextLooksFlavoured,
  legacyRecommendationCohortForCard,
  buildLegacyRecommendationSubsections
} from '../public/catalogue-recommendation-legacy.mjs';

const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const legacySource = await readFile(new URL('../public/catalogue-recommendation-legacy.mjs', import.meta.url), 'utf8');

test('legacy compatibility keeps the 34/35 boundary and structured flavoured override', () => {
  assert.equal(legacyRecommendationCohortForCard({ key: 'a', catalogueType: 'main', ring: 34, productionText: 'Traditional' }), 'coronets');
  assert.equal(legacyRecommendationCohortForCard({ key: 'b', catalogueType: 'main', ring: 35, productionText: 'Traditional' }), 'petit-panatelas');
  assert.equal(legacyRecommendationCohortForCard({ key: 'c', catalogueType: 'main', ring: 26, productionText: 'Infused' }), 'flavoured');
  assert.equal(legacyTextLooksFlavoured('Wrapper: Maduro · Infused'), true);
  assert.equal(legacyTextLooksFlavoured('Traditional long filler'), false);
});

test('KFC Sweet Ponies keeps its legacy explicit flavour exclusion', () => {
  assert.equal(legacyRecommendationCohortForCard({
    key: 'kfc-ponies-sweets', catalogueType: 'main', ring: 32, productionText: 'Flavoured / Sweetened'
  }), 'coronets');
});

test('legacy builder derives contiguous independent entry lists without mutating global ranks', () => {
  const rows = [
    { key: 'coronet-a', catalogueType: 'main', ring: 34, productionText: 'Traditional', legacyRank: 1 },
    { key: 'petit-a', catalogueType: 'main', ring: 35, productionText: 'Traditional', legacyRank: 2 },
    { key: 'flavour-a', catalogueType: 'main', ring: 32, productionText: 'Infused', legacyRank: 3 },
    { key: 'coronet-b', catalogueType: 'main', ring: 34, productionText: 'Traditional', legacyRank: 4 }
  ];
  const sections = buildLegacyRecommendationSubsections(rows);
  assert.deepEqual(sections.find(section => section.id === 'coronets').entryKeys, ['coronet-a', 'coronet-b']);
  assert.deepEqual(sections.find(section => section.id === 'petit-panatelas').entryKeys, ['petit-a']);
  assert.deepEqual(sections.find(section => section.id === 'flavoured').entryKeys, ['flavour-a']);
  assert.deepEqual(rows.map(row => row.legacyRank), [1, 2, 3, 4]);
});

test('Half-Cigar, Taster and archived entries are excluded from legacy Recommendation migration', () => {
  const sections = buildLegacyRecommendationSubsections([
    { key: 'main', catalogueType: 'main', ring: 34, productionText: 'Traditional', legacyRank: 1 },
    { key: 'half', catalogueType: 'half', ring: 34, productionText: 'Traditional', legacyRank: 1 },
    { key: 'taster', catalogueType: 'taster', ring: 34, productionText: 'Traditional', legacyRank: 1 },
    { key: 'archived', catalogueType: 'main', archived: true, ring: 34, productionText: 'Traditional', legacyRank: 1 }
  ]);
  assert.deepEqual(sections.find(section => section.id === 'coronets').entryKeys, ['main']);
});

test('browser runtime uses the explicit subsection controller', () => {
  assert.match(runtimeSource, /import\('\.\/catalogue-recommendation-subsections\.mjs(?:\?v=[^']+)?'\)/);
  assert.doesNotMatch(runtimeSource, /catalogue-recommendation-cohorts\.mjs/);
});

test('legacy compatibility module has no DOM, network or save-transform ownership', () => {
  assert.doesNotMatch(legacySource, /document|MutationObserver|fetch\s*\(|registerCatalogueStateTransform/);
});
