import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  legacyRecommendationCohortForCard,
  buildLegacyRecommendationSubsections
} from '../public/catalogue-recommendation-legacy.mjs';
import * as recommendationRenderer from '../public/catalogue-recommendation-subsections.mjs';

const {
  recommendationSubsectionsForState,
  updateRecommendationRankVisual
} = recommendationRenderer;

const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../public/catalogue-recommendation-subsections.mjs', import.meta.url), 'utf8');

test('runtime loads the explicit Recommendation subsection controller and retires the overlay', () => {
  assert.match(runtimeSource, /catalogue-recommendation-subsections\.mjs/);
  assert.doesNotMatch(runtimeSource, /catalogue-recommendation-cohorts\.mjs/);
});

test('v4 renderer does not reuse legacy Elite Strong or Neither containers', () => {
  assert.doesNotMatch(rendererSource, /data-tier-section=[\\"']elite[\\"']/);
  assert.doesNotMatch(rendererSource, /data-tier-section=[\\"']strong[\\"']/);
  assert.doesNotMatch(rendererSource, /data-noteworthy-section=[\\"']neither[\\"']/);
  assert.match(rendererSource, /data-recommendation-subsection/);
});

test('v4 explicit arrays are authoritative and ignore legacy rank or flavour wording', () => {
  const state = {
    version: 4,
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['joya-black', 'm81'] },
      { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: ['tabak'] }
    ]
  };
  const rows = [
    { key: 'joya-black', ring: 50, productionText: 'Full-flavoured traditional cigar', legacyRank: 99 },
    { key: 'm81', ring: 32, productionText: 'Traditional', legacyRank: 1 },
    { key: 'tabak', ring: 32, productionText: 'Infused', legacyRank: 2 }
  ];
  assert.deepEqual(recommendationSubsectionsForState(state, rows), state.recommendationSubsections);
});

test('v3 compatibility classifies only before explicit v4 state exists', () => {
  assert.equal(legacyRecommendationCohortForCard({
    key: 'plain-34', catalogueType: 'main', ring: 34, productionText: 'Traditional'
  }), 'coronets');
  assert.equal(legacyRecommendationCohortForCard({
    key: 'plain-35', catalogueType: 'main', ring: 35, productionText: 'Traditional'
  }), 'petit-panatelas');
  assert.equal(legacyRecommendationCohortForCard({
    key: 'tabak', catalogueType: 'main', ring: 32, productionText: 'Infused'
  }), 'flavoured');
  assert.equal(legacyRecommendationCohortForCard({
    key: 'kfc-ponies-sweets', catalogueType: 'main', ring: 32, productionText: 'Flavoured / Sweetened'
  }), 'coronets');
  assert.equal(legacyRecommendationCohortForCard({
    key: 'half', catalogueType: 'half', ring: 34, productionText: 'Traditional'
  }), '');
});

test('legacy subsection builder keeps old intended ranking only as migration compatibility', () => {
  const sections = buildLegacyRecommendationSubsections([
    { key: 'b', catalogueType: 'main', ring: 34, productionText: 'Traditional', recommendationCohort: 'coronets', recommendationRank: 2, legacyRank: 1 },
    { key: 'a', catalogueType: 'main', ring: 34, productionText: 'Traditional', recommendationCohort: 'coronets', recommendationRank: 1, legacyRank: 9 },
    { key: 'c', catalogueType: 'main', ring: 35, productionText: 'Traditional', legacyRank: 3 },
    { key: 'f', catalogueType: 'main', ring: 26, productionText: 'Infused', legacyRank: 4 },
    { key: 'archived', catalogueType: 'main', archived: true, ring: 34, productionText: 'Traditional', legacyRank: 1 },
    { key: 'half', catalogueType: 'half', ring: 34, productionText: 'Traditional', legacyRank: 1 }
  ]);
  assert.deepEqual(sections.map(section => section.id), ['coronets', 'petit-panatelas', 'flavoured']);
  assert.deepEqual(sections[0].entryKeys, ['a', 'b']);
  assert.deepEqual(sections[1].entryKeys, ['c']);
  assert.deepEqual(sections[2].entryKeys, ['f']);
});

test('rank visual writes only the rank flag and never the editable eyebrow', () => {
  let eyebrowText = 'Sublime small-format powerhouse';
  let eyebrowWrites = 0;
  const eyebrow = {
    get textContent() { return eyebrowText; },
    set textContent(value) { eyebrowWrites += 1; eyebrowText = value; }
  };
  const label = { textContent: 'wrong' };
  const value = { textContent: 'wrong' };
  const rankflag = {
    querySelector(selector) {
      if (selector === 'span') return label;
      if (selector === 'b') return value;
      return null;
    }
  };
  const card = {
    dataset: {},
    querySelector(selector) {
      if (selector === '.rankflag') return rankflag;
      if (selector === '.eyebrow') return eyebrow;
      return null;
    }
  };
  updateRecommendationRankVisual(card, 2);
  assert.equal(label.textContent, 'No.');
  assert.equal(value.textContent, '2');
  assert.equal(card.dataset.recommendationRank, '2');
  assert.equal(eyebrowText, 'Sublime small-format powerhouse');
  assert.equal(eyebrowWrites, 0);
});

test('current stock state overrides a stale unavailable-grid DOM location', () => {
  assert.equal(typeof recommendationRenderer.recommendationCardUnavailable, 'function');
  const card = {
    dataset: { stockPin: 'auto', stock: 'in' },
    classList: { contains: () => false },
    closest(selector) { return selector === '.unavailable-grid' ? { id: 'old-unavailable-grid' } : null; }
  };
  assert.equal(recommendationRenderer.recommendationCardUnavailable(card, {}), false);
});

test('relocating an available Recommendation card clears stale unavailable visibility classes', () => {
  assert.equal(typeof recommendationRenderer.prepareRecommendationCardForActiveGrid, 'function');
  const classes = new Set(['card', 'hidden', 'is-unavailable']);
  const card = {
    classList: {
      remove(...names) { names.forEach(name => classes.delete(name)); }
    }
  };
  recommendationRenderer.prepareRecommendationCardForActiveGrid(card);
  assert.equal(classes.has('hidden'), false);
  assert.equal(classes.has('is-unavailable'), false);
  assert.equal(classes.has('card'), true);
});
