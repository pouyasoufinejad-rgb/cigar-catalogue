import test from 'node:test';
import assert from 'node:assert/strict';

let cohort = null;
try {
  cohort = await import('../public/catalogue-half-cohort.mjs');
} catch (_) {
  cohort = null;
}

test('Half-Cigar is a third catalogue type with its own H ranking', () => {
  assert.ok(cohort, 'Half-Cigar cohort module must load');
  assert.equal(cohort.normaliseCatalogueType('main'), 'main');
  assert.equal(cohort.normaliseCatalogueType('taster'), 'taster');
  assert.equal(cohort.normaliseCatalogueType('half'), 'half');
  assert.deepEqual(cohort.rankDisplayForType('half', 2), {
    label: 'Half-Cigar',
    value: 'H2',
    eyebrow: 'H2'
  });
});

test('moving a recommendation into Half-Cigar compacts main and ranks Half-Cigar independently', () => {
  assert.ok(cohort, 'Half-Cigar cohort module must load');
  const rows = [
    { key: 'main-a', rank: 1, catalogueType: 'main', archived: false },
    { key: 'move-me', rank: 2, catalogueType: 'main', archived: false },
    { key: 'main-c', rank: 3, catalogueType: 'main', archived: false },
    { key: 'half-a', rank: 1, catalogueType: 'half', archived: false },
    { key: 'taster-a', rank: 1, catalogueType: 'taster', archived: false }
  ];

  const updates = cohort.reorderCatalogueCohorts(rows, {}, {
    key: 'move-me',
    targetType: 'half',
    targetRank: 2,
    wantsArchived: false,
    now: '2026-09-08T12:00:00Z'
  });

  assert.equal(updates['main-a'].rank, 1);
  assert.equal(updates['main-c'].rank, 2);
  assert.equal(updates['half-a'].rank, 1);
  assert.equal(updates['move-me'].rank, 2);
  assert.equal(updates['move-me'].catalogueType, 'half');
  assert.equal(updates['move-me'].taster, false);
  assert.equal(updates['taster-a'], undefined);
});

test('moving Half-Cigar to Taster compacts H ranks and inserts into T ranks', () => {
  assert.ok(cohort, 'Half-Cigar cohort module must load');
  const rows = [
    { key: 'half-a', rank: 1, catalogueType: 'half', archived: false },
    { key: 'move-me', rank: 2, catalogueType: 'half', archived: false },
    { key: 'half-c', rank: 3, catalogueType: 'half', archived: false },
    { key: 'taster-a', rank: 1, catalogueType: 'taster', archived: false },
    { key: 'taster-b', rank: 2, catalogueType: 'taster', archived: false }
  ];

  const updates = cohort.reorderCatalogueCohorts(rows, {}, {
    key: 'move-me',
    targetType: 'taster',
    targetRank: 2,
    wantsArchived: false
  });

  assert.equal(updates['half-a'].rank, 1);
  assert.equal(updates['half-c'].rank, 2);
  assert.equal(updates['taster-a'].rank, 1);
  assert.equal(updates['move-me'].rank, 2);
  assert.equal(updates['taster-b'].rank, 3);
  assert.equal(updates['move-me'].catalogueType, 'taster');
  assert.equal(updates['move-me'].taster, true);
});

test('Half-Cigar UI creates a separate section and editor type instead of a recommendation subsection', () => {
  assert.ok(cohort, 'Half-Cigar cohort module must load');
  const source = cohort.__sourceContract || {};
  assert.equal(source.sectionId, 'half-cigar-section');
  assert.equal(source.gridId, 'half-cigar-cards');
  assert.equal(source.editorValue, 'half');
  assert.equal(source.filterValue, 'half');
});
