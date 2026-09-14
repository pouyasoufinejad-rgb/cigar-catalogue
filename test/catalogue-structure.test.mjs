import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOGUE_STATE_VERSION,
  normaliseCatalogueType,
  validateRecommendationSubsectionsShape,
  recommendationMembership,
  recommendationLocation,
  addRecommendationSubsection,
  updateRecommendationSubsection,
  reorderRecommendationSubsections,
  deleteRecommendationSubsection,
  moveRecommendationEntry,
  removeRecommendationEntry,
  assertRecommendationInventory,
  applyCatalogueStructuralChange
} from '../public/catalogue-structure.mjs';

const base = Object.freeze([
  Object.freeze({ id: 'coronets', name: 'Coronets', description: '34 ring gauge or lower.', entryKeys: Object.freeze(['a', 'b']) }),
  Object.freeze({ id: 'petit-panatelas', name: 'Petit Panatelas', description: '35 ring gauge or higher.', entryKeys: Object.freeze(['c']) })
]);

test('catalogue structure version is 4 and type normalization preserves the three top-level types', () => {
  assert.equal(CATALOGUE_STATE_VERSION, 4);
  assert.equal(normaliseCatalogueType('main'), 'main');
  assert.equal(normaliseCatalogueType('half-cigar'), 'half');
  assert.equal(normaliseCatalogueType('taster'), 'taster');
  assert.equal(normaliseCatalogueType('', true), 'taster');
});

test('subsection order and entry order are authoritative and input is not mutated', () => {
  const moved = moveRecommendationEntry(base, {
    key: 'b', targetSubsectionId: 'petit-panatelas', targetPosition: 1
  });
  assert.deepEqual(moved.map(section => section.id), ['coronets', 'petit-panatelas']);
  assert.deepEqual(moved[0].entryKeys, ['a']);
  assert.deepEqual(moved[1].entryKeys, ['b', 'c']);
  assert.deepEqual(recommendationMembership(moved).b, {
    subsectionId: 'petit-panatelas', position: 1
  });
  assert.deepEqual(recommendationLocation(moved, 'c'), {
    subsectionId: 'petit-panatelas', position: 2
  });
  assert.deepEqual(base[0].entryKeys, ['a', 'b']);
});

test('rename and description edit preserve stable subsection id and membership', () => {
  const next = updateRecommendationSubsection(base, {
    id: 'coronets', name: 'Small Formats', description: 'Edited description'
  });
  assert.equal(next[0].id, 'coronets');
  assert.equal(next[0].name, 'Small Formats');
  assert.equal(next[0].description, 'Edited description');
  assert.deepEqual(next[0].entryKeys, ['a', 'b']);
});

test('subsections can be added and reordered without changing membership', () => {
  const added = addRecommendationSubsection(base, {
    id: 'new-section', name: 'New Section', description: 'Empty', index: 1
  });
  assert.deepEqual(added.map(section => section.id), ['coronets', 'new-section', 'petit-panatelas']);
  assert.deepEqual(added[1].entryKeys, []);

  const reordered = reorderRecommendationSubsections(added, {
    id: 'new-section', targetIndex: 0
  });
  assert.deepEqual(reordered.map(section => section.id), ['new-section', 'coronets', 'petit-panatelas']);
  assert.deepEqual(reordered.find(section => section.id === 'coronets').entryKeys, ['a', 'b']);
});

test('empty subsection deletion succeeds but non-empty subsection deletion is rejected', () => {
  const added = addRecommendationSubsection(base, {
    id: 'empty', name: 'Empty', description: '', index: 2
  });
  assert.deepEqual(deleteRecommendationSubsection(added, 'empty').map(section => section.id), ['coronets', 'petit-panatelas']);
  assert.throws(() => deleteRecommendationSubsection(base, 'coronets'), /not empty/i);
});

test('invalid subsection ids, duplicate ids and duplicate membership are rejected', () => {
  assert.throws(() => validateRecommendationSubsectionsShape([
    { id: 'Bad ID', name: 'Bad', description: '', entryKeys: [] }
  ]), /invalid.*id/i);
  assert.throws(() => validateRecommendationSubsectionsShape([
    { id: 'one', name: 'One', description: '', entryKeys: [] },
    { id: 'one', name: 'Again', description: '', entryKeys: [] }
  ]), /duplicate.*id/i);
  assert.throws(() => validateRecommendationSubsectionsShape([
    { id: 'one', name: 'One', description: '', entryKeys: ['a'] },
    { id: 'two', name: 'Two', description: '', entryKeys: ['a'] }
  ]), /duplicate.*a/i);
});

test('move requires an existing destination subsection and a valid one-based insertion position', () => {
  assert.throws(() => moveRecommendationEntry(base, {
    key: 'a', targetSubsectionId: 'missing', targetPosition: 1
  }), /subsection/i);
  assert.throws(() => moveRecommendationEntry(base, {
    key: 'a', targetSubsectionId: 'coronets', targetPosition: 0
  }), /position/i);
  assert.throws(() => moveRecommendationEntry(base, {
    key: 'a', targetSubsectionId: 'coronets', targetPosition: 99
  }), /position/i);
});

test('remove Recommendation entry is idempotent and compacts by list position', () => {
  const removed = removeRecommendationEntry(base, 'a');
  assert.deepEqual(removed[0].entryKeys, ['b']);
  assert.deepEqual(removeRecommendationEntry(removed, 'missing'), removed);
});

test('inventory requires every active Recommendation exactly once and rejects forbidden members', () => {
  assert.equal(assertRecommendationInventory({
    subsections: base,
    activeRecommendationKeys: ['a', 'b', 'c'],
    forbiddenKeys: []
  }), true);
  assert.throws(() => assertRecommendationInventory({
    subsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] }],
    activeRecommendationKeys: ['a', 'b'],
    forbiddenKeys: []
  }), /missing.*b/i);
  assert.throws(() => assertRecommendationInventory({
    subsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['half-a'] }],
    activeRecommendationKeys: [],
    forbiddenKeys: ['half-a']
  }), /forbidden.*half-a/i);
});

test('Recommendation to Half removes subsection membership and changes only the destination numbered cohort', () => {
  const result = applyCatalogueStructuralChange({
    cards: {
      rec: { catalogueType: 'main', archived: false, rank: 99 },
      h1: { catalogueType: 'half', archived: false, rank: 1 },
      t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
    },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['rec'] }
    ],
    key: 'rec',
    targetType: 'half',
    targetSubsectionId: '',
    targetPosition: 2,
    wantsArchived: false,
    now: '2026-09-14T12:00:00Z'
  });
  assert.deepEqual(result.recommendationSubsections[0].entryKeys, []);
  assert.equal(result.cards.rec.catalogueType, 'half');
  assert.equal(result.cards.rec.taster, false);
  assert.equal(result.cards.rec.rank, 2);
  assert.equal(result.cards.h1.rank, 1);
  assert.equal(result.cards.t1.rank, 1);
});

test('Recommendation to Taster compacts no unrelated Half ranks', () => {
  const result = applyCatalogueStructuralChange({
    cards: {
      rec: { catalogueType: 'main', archived: false },
      h1: { catalogueType: 'half', archived: false, rank: 1 },
      t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
    },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['rec'] }
    ],
    key: 'rec', targetType: 'taster', targetPosition: 1,
    targetSubsectionId: '', wantsArchived: false
  });
  assert.equal(result.cards.rec.rank, 1);
  assert.equal(result.cards.rec.taster, true);
  assert.equal(result.cards.t1.rank, 2);
  assert.equal(result.cards.h1.rank, 1);
});

test('Half to Recommendation compacts Half and inserts at explicit subsection position', () => {
  const result = applyCatalogueStructuralChange({
    cards: {
      h1: { catalogueType: 'half', archived: false, rank: 1 },
      move: { catalogueType: 'half', archived: false, rank: 2 },
      h3: { catalogueType: 'half', archived: false, rank: 3 },
      t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
    },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['r1'] }
    ],
    key: 'move', targetType: 'main', targetSubsectionId: 'coronets',
    targetPosition: 1, wantsArchived: false
  });
  assert.deepEqual(result.recommendationSubsections[0].entryKeys, ['move', 'r1']);
  assert.equal(result.cards.move.catalogueType, 'main');
  assert.equal('rank' in result.cards.move, false);
  assert.equal(result.cards.h1.rank, 1);
  assert.equal(result.cards.h3.rank, 2);
  assert.equal(result.cards.t1.rank, 1);
});

test('archiving removes Recommendation membership and leaves the entry outside all active rankings', () => {
  const result = applyCatalogueStructuralChange({
    cards: {
      rec: { catalogueType: 'main', archived: false },
      h1: { catalogueType: 'half', archived: false, rank: 1 }
    },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['rec'] }
    ],
    key: 'rec', targetType: 'main', targetSubsectionId: '', targetPosition: 1,
    wantsArchived: true, now: '2026-09-14T12:00:00Z'
  });
  assert.deepEqual(result.recommendationSubsections[0].entryKeys, []);
  assert.equal(result.cards.rec.archived, true);
  assert.equal(result.cards.rec.archivedAt, '2026-09-14T12:00:00Z');
  assert.equal('rank' in result.cards.rec, false);
  assert.equal(result.cards.h1.rank, 1);
});

test('restoring archive to Recommendation requires an explicit existing subsection', () => {
  assert.throws(() => applyCatalogueStructuralChange({
    cards: { rec: { catalogueType: 'main', archived: true } },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: [] }
    ],
    key: 'rec', targetType: 'main', targetSubsectionId: '',
    targetPosition: 1, wantsArchived: false
  }), /subsection/i);
});

test('restoring archive to Taster uses explicit local position', () => {
  const result = applyCatalogueStructuralChange({
    cards: {
      rec: { catalogueType: 'main', archived: true, archivedAt: 'old' },
      t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
    },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: [] }
    ],
    key: 'rec', targetType: 'taster', targetSubsectionId: '',
    targetPosition: 2, wantsArchived: false
  });
  assert.equal(result.cards.rec.archived, false);
  assert.equal(result.cards.rec.archivedAt, '');
  assert.equal(result.cards.rec.rank, 2);
  assert.equal(result.cards.t1.rank, 1);
});
