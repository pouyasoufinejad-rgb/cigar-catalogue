import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseState, mergeState } from '../src/index.js';
import {
  DEFAULT_RECOMMENDATION_SUBSECTIONS,
  normaliseSubsections,
  reconcileRecommendationSubsections,
  syncRecommendationRanks,
  moveEntryToSubsection,
  resolveRingGauge,
  seedSubsectionForCard
} from '../public/catalogue-recommendation-subsections.mjs';

function stateWith(subsections, cards = {}, entries = {}) {
  return { version: 3, cards, sections: { legendHtml: '<b>Legend</b>', recommendationSubsections: subsections }, entries };
}

function card(key, { rank = 1, type = 'main', archived = false, ring, sizeText = '', productionLines = [] } = {}) {
  return { key, rank, catalogueType: type, archived, ring, sizeText, productionLines };
}

test('recommendation subsections round-trip inside sections through normaliseState and mergeState', () => {
  const subsections = [{ id: 'alpha', title: 'Alpha', note: 'A', entryKeys: ['one'] }];
  const normalised = normaliseState(stateWith(subsections));
  assert.deepEqual(normalised.sections.recommendationSubsections, subsections);
  const merged = mergeState(normalised, { sections: { ...normalised.sections, legendHtml: '<b>Changed</b>' } });
  assert.deepEqual(merged.sections.recommendationSubsections, subsections);
});

test('invalid or absent subsection data seeds the three stable default subsections', () => {
  assert.deepEqual(normaliseSubsections(null), DEFAULT_RECOMMENDATION_SUBSECTIONS.map(section => ({ ...section, entryKeys: [] })));
  assert.deepEqual(normaliseSubsections([{ nope: true }]), DEFAULT_RECOMMENDATION_SUBSECTIONS.map(section => ({ ...section, entryKeys: [] })));
});

test('ring gauge resolution prefers explicit ring data and recognises the two-digit gauge in dimensions', () => {
  assert.equal(resolveRingGauge(card('visual', { ring: 38, sizeText: '4″ × 34' }), {}), 38);
  assert.equal(resolveRingGauge(card('dimensions', { sizeText: '4″ × 34' }), {}), 34);
  assert.equal(resolveRingGauge(card('ascii', { sizeText: '4 x 38' }), {}), 38);
  assert.equal(resolveRingGauge(card('unknown'), {}), null);
});

test('seeding precedence sends flavoured first, ring 35+ to petit panatelas, and unknown ring to coronets', () => {
  assert.equal(seedSubsectionForCard(card('flavoured', { ring: 30, productionLines: ['Handmade', 'Flavoured'] }), {}), 'flavoured-infused');
  assert.equal(seedSubsectionForCard(card('petit', { ring: 35 }), {}), 'petit-panatelas');
  assert.equal(seedSubsectionForCard(card('unknown'), {}), 'coronets-cigarillos');
  assert.equal(seedSubsectionForCard(card('prose', { ring: 30, productionLines: ['Not flavoured tobacco'] }), {}), 'coronets-cigarillos');
});

test('reconciliation drops invalid members, deduplicates, preserves existing order and appends missing main cards by prior rank', () => {
  const subsections = [
    { id: 'coronets-cigarillos', title: 'Coronets', note: '', entryKeys: ['keep', 'dupe', 'half', 'archived'] },
    { id: 'petit-panatelas', title: 'Petit', note: '', entryKeys: ['dupe'] },
    { id: 'flavoured-infused', title: 'Flavoured', note: '', entryKeys: [] }
  ];
  const cards = [
    card('keep', { rank: 8, ring: 32 }), card('dupe', { rank: 7, ring: 36 }),
    card('half', { type: 'half', rank: 1, ring: 40 }), card('archived', { archived: true, rank: 3, ring: 40 }),
    card('late', { rank: 12, ring: 36 }), card('early', { rank: 2, ring: 36 })
  ];
  const state = stateWith(subsections, { half: { catalogueType: 'half', rank: 1 }, archived: { archived: true } });
  reconcileRecommendationSubsections(state, cards);
  assert.deepEqual(state.sections.recommendationSubsections[0].entryKeys, ['keep', 'dupe']);
  assert.deepEqual(state.sections.recommendationSubsections[1].entryKeys, ['early', 'late']);
  assert.deepEqual(state.sections.recommendationSubsections[2].entryKeys, []);
});

test('moving between subsections produces independent contiguous ranks and leaves half/taster ranks untouched', () => {
  const subsections = [
    { id: 'a', title: 'A', note: '', entryKeys: ['a1', 'a2', 'a3'] },
    { id: 'b', title: 'B', note: '', entryKeys: ['b1', 'b2'] }
  ];
  const state = stateWith(subsections, { half: { catalogueType: 'half', rank: 4 }, taster: { catalogueType: 'taster', rank: 6 } });
  moveEntryToSubsection(state, 'a3', 'b', 1);
  assert.deepEqual(state.sections.recommendationSubsections[0].entryKeys, ['a1', 'a2']);
  assert.deepEqual(state.sections.recommendationSubsections[1].entryKeys, ['a3', 'b1', 'b2']);
  assert.deepEqual([state.cards.a1.rank, state.cards.a2.rank], [1, 2]);
  assert.deepEqual([state.cards.a3.rank, state.cards.b1.rank, state.cards.b2.rank], [1, 2, 3]);
  assert.equal(state.cards.a3.subsection, 'b');
  assert.equal(state.cards.half.rank, 4);
  assert.equal(state.cards.taster.rank, 6);
});

test('sync mirrors entryKeys without changing stable subsection ids or membership on title edits', () => {
  const subsections = [
    { id: 'same-id', title: 'Before', note: '', entryKeys: ['one', 'two'] },
    { id: 'other', title: 'Other', note: '', entryKeys: ['three'] }
  ];
  const state = stateWith(subsections);
  state.sections.recommendationSubsections[0].title = 'After';
  syncRecommendationRanks(state);
  assert.equal(state.sections.recommendationSubsections[0].id, 'same-id');
  assert.deepEqual(state.sections.recommendationSubsections[0].entryKeys, ['one', 'two']);
  assert.equal(state.cards.one.rank, 1);
  assert.equal(state.cards.three.rank, 1);
  assert.equal(state.cards.one.subsection, 'same-id');
  assert.equal(state.cards.three.subsection, 'other');
});
