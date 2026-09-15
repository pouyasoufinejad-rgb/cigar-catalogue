import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileRecommendationSubsections,
  moveEntryToSubsection
} from '../public/catalogue-recommendation-subsections.mjs';

function defaults() {
  return {
    version: 3,
    cards: {},
    entries: {},
    sections: {}
  };
}

function card(key, rank, { ring = 32, productionLines = [], flavour = null } = {}) {
  return {
    key,
    rank,
    catalogueType: 'main',
    archived: false,
    ring,
    productionLines,
    flavour
  };
}

test('Flavour rating or medal state does not route recommendations; only an exact Production Flavoured line seeds the flavoured subsection', () => {
  const state = defaults();
  const cards = [
    card('gold-flavour', 1, { flavour: 10, productionLines: ['Handmade', 'Natural'] }),
    card('exact-flavoured', 2, { flavour: 1, productionLines: ['Handmade', 'Flavoured'] }),
    card('mentions-flavoured', 3, { flavour: 10, productionLines: ['Not flavoured tobacco'] })
  ];

  reconcileRecommendationSubsections(state, cards);
  assert.deepEqual(state.sections.recommendationSubsections[0].entryKeys, ['gold-flavour', 'mentions-flavoured']);
  assert.deepEqual(state.sections.recommendationSubsections[2].entryKeys, ['exact-flavoured']);
});

test('manual subsection placement survives later reconciliation even when automatic seed metadata points elsewhere', () => {
  const state = defaults();
  const cards = [card('manual', 1, { ring: 32, productionLines: ['Flavoured'] })];
  reconcileRecommendationSubsections(state, cards);
  assert.deepEqual(state.sections.recommendationSubsections[2].entryKeys, ['manual']);

  moveEntryToSubsection(state, 'manual', 'petit-panatelas', 1);
  reconcileRecommendationSubsections(state, cards);

  assert.deepEqual(state.sections.recommendationSubsections[1].entryKeys, ['manual']);
  assert.deepEqual(state.sections.recommendationSubsections[2].entryKeys, []);
  assert.equal(state.cards.manual.subsection, 'petit-panatelas');
  assert.equal(state.cards.manual.rank, 1);
});
