import test from 'node:test';
import assert from 'node:assert/strict';

import {
  browserStateFromPayload,
  rankingUpdatesForSave
} from '../public/catalogue-admin-unified-v139.mjs';

const rows = [
  { key: 'a', rank: 7, taster: false, archived: false },
  { key: 'b', rank: 8, taster: false, archived: false },
  { key: 'c', rank: 9, taster: false, archived: false }
];

test('browser state keeps v4 Recommendation subsection state instead of downgrading it to v3', () => {
  const subsections = [
    { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a', 'b'] },
    { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: ['c'] }
  ];
  const state = browserStateFromPayload({
    version: 4,
    cards: { a: { quality: 9 } },
    entries: { b: { title: 'B' } },
    sections: { legendHtml: '<b>Legend</b>' },
    recommendationSubsections: subsections
  });

  assert.equal(state.version, 4);
  assert.deepEqual(state.recommendationSubsections, subsections);
  assert.equal(state.cards.a.quality, 9);
  assert.equal(state.entries.b.title, 'B');
});

test('v4 Recommendation rank edits do not run the legacy global main-catalogue reorder', () => {
  const updates = rankingUpdatesForSave(rows, {}, {
    key: 'b',
    targetCatalogueType: 'main',
    stateVersion: 4,
    taster: false,
    wantsArchived: false,
    targetRank: 1,
    now: '2026-09-14T10:30:00Z'
  });
  assert.deepEqual(updates, {});
});

test('legacy v3 Recommendation saves keep the existing global reorder behaviour', () => {
  const updates = rankingUpdatesForSave(rows, {}, {
    key: 'b',
    targetCatalogueType: 'main',
    stateVersion: 3,
    taster: false,
    wantsArchived: false,
    targetRank: 1,
    now: '2026-09-14T10:30:00Z'
  });
  assert.equal(updates.b.rank, 1);
  assert.equal(updates.a.rank, 2);
});
