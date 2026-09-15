import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRecommendationSubsections } from '../public/catalogue-recommendation-subsections.mjs';

function card(key, rank, { ring = 32, catalogueType = 'main', archived = false } = {}) {
  return { key, rank, ring, catalogueType, archived, productionLines: [] };
}

test('ring gauge 35 and over seeds Petit Panatelas while smaller main cigars seed Coronets & Cigarillos', () => {
  const state = { version: 3, cards: {}, entries: {}, sections: {} };
  const cards = [
    card('ring-34', 1, { ring: 34 }),
    card('ring-35', 2, { ring: 35 }),
    card('ring-38', 3, { ring: 38 })
  ];

  reconcileRecommendationSubsections(state, cards);
  assert.deepEqual(state.sections.recommendationSubsections[0].entryKeys, ['ring-34']);
  assert.deepEqual(state.sections.recommendationSubsections[1].entryKeys, ['ring-35', 'ring-38']);
});

test('Half-Cigar, Taster, and archived cards are never recommendation subsection members', () => {
  const state = { version: 3, cards: {}, entries: {}, sections: {} };
  const cards = [
    card('main', 1, { ring: 38 }),
    card('half', 1, { ring: 38, catalogueType: 'half' }),
    card('taster', 1, { ring: 38, catalogueType: 'taster' }),
    card('archived', 2, { ring: 38, archived: true })
  ];

  reconcileRecommendationSubsections(state, cards);
  const members = state.sections.recommendationSubsections.flatMap(section => section.entryKeys);
  assert.deepEqual(members, ['main']);
  assert.equal(state.cards.half?.subsection, undefined);
  assert.equal(state.cards.taster?.subsection, undefined);
  assert.equal(state.cards.archived?.subsection, undefined);
});
