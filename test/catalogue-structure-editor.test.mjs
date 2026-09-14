import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  preserveExplicitStructure,
  prepareV4StructuralPayload,
  generatedSubsectionId
} from '../public/catalogue-structure-editor.mjs';

const structureEditorSource = await readFile(new URL('../public/catalogue-structure-editor.mjs', import.meta.url), 'utf8');
const halfSource = await readFile(new URL('../public/catalogue-half-cohort.mjs', import.meta.url), 'utf8');
const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

const explicit = [
  { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a', 'b'] },
  { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: ['c'] },
  { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: [] }
];

const state = {
  version: 4,
  cards: {
    h1: { catalogueType: 'half', rank: 1 },
    t1: { catalogueType: 'taster', taster: true, rank: 1 }
  },
  entries: {},
  recommendationSubsections: explicit
};

const rows = [
  { key: 'a', catalogueType: 'main', archived: false },
  { key: 'b', catalogueType: 'main', archived: false },
  { key: 'c', catalogueType: 'main', archived: false },
  { key: 'h1', catalogueType: 'half', archived: false, rank: 1 },
  { key: 't1', catalogueType: 'taster', taster: true, archived: false, rank: 1 }
];

test('non-structural state PUT preserves v4 subsection state and never downgrades to v3', () => {
  const payload = preserveExplicitStructure({
    version: 3,
    cards: { a: { quality: 9 } },
    sections: {}
  }, state);
  assert.equal(payload.version, 4);
  assert.deepEqual(payload.recommendationSubsections, explicit);
  assert.equal(payload.cards.a.quality, 9);
});

test('moving inside Recommendation changes only explicit list order and keeps editorial fields', () => {
  const payload = prepareV4StructuralPayload({
    payload: { version: 3, cards: { b: { quality: 8, rank: 99 } }, sections: {} },
    persistedState: state,
    rows,
    key: 'b', targetType: 'main', targetSubsectionId: 'petit-panatelas',
    targetPosition: 1, wantsArchived: false, now: '2026-09-14T12:00:00Z'
  });
  assert.deepEqual(payload.recommendationSubsections[0].entryKeys, ['a']);
  assert.deepEqual(payload.recommendationSubsections[1].entryKeys, ['b', 'c']);
  assert.equal(payload.cards.b.quality, 8);
  assert.equal(payload.cards.b.catalogueType, 'main');
  assert.equal(Object.hasOwn(payload.cards.b, 'rank'), false, 'Recommendation local rank must not persist as global rank');
  assert.equal(payload.cards.h1.rank, 1);
  assert.equal(payload.cards.t1.rank, 1);
});

test('Recommendation to Half removes subsection membership and ranks only Half destination', () => {
  const payload = prepareV4StructuralPayload({
    payload: { version: 3, cards: { b: { eyebrow: 'Keep me' } }, sections: {} },
    persistedState: state,
    rows,
    key: 'b', targetType: 'half', targetSubsectionId: '',
    targetPosition: 2, wantsArchived: false, now: '2026-09-14T12:00:00Z'
  });
  assert.deepEqual(payload.recommendationSubsections[0].entryKeys, ['a']);
  assert.equal(payload.cards.b.catalogueType, 'half');
  assert.equal(payload.cards.b.rank, 2);
  assert.equal(payload.cards.b.eyebrow, 'Keep me');
  assert.equal(payload.cards.h1.rank, 1);
  assert.equal(payload.cards.t1.rank, 1);
});

test('archive restoration to Recommendation requires explicit subsection destination', () => {
  assert.throws(() => prepareV4StructuralPayload({
    payload: { version: 3, cards: {}, sections: {} },
    persistedState: {
      ...state,
      cards: { ...state.cards, archived: { catalogueType: 'main', archived: true } }
    },
    rows: [...rows, { key: 'archived', catalogueType: 'main', archived: true }],
    key: 'archived', targetType: 'main', targetSubsectionId: '',
    targetPosition: 1, wantsArchived: false
  }), /subsection/i);
});

test('subsection ids are generated once and collision-safe', () => {
  assert.equal(generatedSubsectionId('Small Formats', new Set()), 'small-formats');
  assert.equal(generatedSubsectionId('Small Formats', new Set(['small-formats'])), 'small-formats-2');
  assert.equal(generatedSubsectionId('!!!', new Set(['subsection'])), 'subsection-2');
});

test('runtime loads structural editor integration', () => {
  assert.match(runtimeSource, /catalogue-structure-editor\.mjs/);
});

test('structural editor owns one save transform and exposes Recommendation subsection controls', () => {
  assert.match(structureEditorSource, /const STRUCTURE_TRANSFORM = ['"]catalogue-v4-structure['"]/);
  assert.match(structureEditorSource, /registerCatalogueStateTransform\(STRUCTURE_TRANSFORM,\s*90/);
  assert.match(structureEditorSource, /catalogue-admin-recommendation-subsection/);
  assert.match(structureEditorSource, /catalogue-admin-subsection-manager/);
  assert.match(structureEditorSource, /Recommendation subsections/);
});

test('Half-Cigar display module no longer owns a structural save transform', () => {
  assert.doesNotMatch(halfSource, /registerCatalogueStateTransform/);
  assert.doesNotMatch(halfSource, /patchStatePayloadForEditor/);
});
