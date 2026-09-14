import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  legacyRecommendationCohortForRow,
  buildLegacyRecommendationSubsections
} from '../public/catalogue-recommendation-legacy.mjs';

const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const legacySource = await readFile(new URL('../public/catalogue-recommendation-legacy.mjs', import.meta.url), 'utf8');

test('legacy compatibility keeps the 34/35 boundary and structured flavoured override', () => {
  assert.equal(legacyRecommendationCohortForRow({ key: 'a', catalogueType: 'main', ring: 34, productionText: 'Traditional' }), 'coronets');
  assert.equal(legacyRecommendationCohortForRow({ key: 'b', catalogueType: 'main', ring: 35, productionText: 'Traditional' }), 'petit-panatelas');
  assert.equal(legacyRecommendationCohortForRow({ key: 'c', catalogueType: 'main', ring: 50, productionText: 'Infused with vanilla' }), 'flavoured');
});

test('KFC Sweet Ponies keeps its legacy explicit flavour exclusion', () => {
  assert.equal(legacyRecommendationCohortForRow({
    key: 'kfc-ponies-sweets',
    catalogueType: 'main',
    ring: 32,
    productionText: 'Fire-cured sweet-tipped cigar'
  }), 'coronets');
});

test('legacy builder derives contiguous independent entry lists without mutating global ranks', () => {
  const sections = buildLegacyRecommendationSubsections([
    { key: 'c2', catalogueType: 'main', ring: 32, productionText: 'Traditional', legacyRank: 20 },
    { key: 'c1', catalogueType: 'main', ring: 32, productionText: 'Traditional', legacyRank: 10 },
    { key: 'p2', catalogueType: 'main', ring: 38, productionText: 'Traditional', legacyRank: 3 },
    { key: 'p1', catalogueType: 'main', ring: 38, productionText: 'Traditional', legacyRank: 2 },
    { key: 'f1', catalogueType: 'main', ring: 50, productionText: 'Infused vanilla', legacyRank: 99 }
  ]);
  assert.deepEqual(sections.find(section => section.id === 'coronets').entryKeys, ['c1', 'c2']);
  assert.deepEqual(sections.find(section => section.id === 'petit-panatelas').entryKeys, ['p1', 'p2']);
  assert.deepEqual(sections.find(section => section.id === 'flavoured').entryKeys, ['f1']);
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
