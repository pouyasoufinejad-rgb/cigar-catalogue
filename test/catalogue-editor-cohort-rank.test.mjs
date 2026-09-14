import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { rankingUpdatesForSave, buildStructuralOverride } from '../public/catalogue-admin-unified-v139.mjs';

const adminSource = await readFile(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');
const structureSource = await readFile(new URL('../public/catalogue-structure-editor.mjs', import.meta.url), 'utf8');

const MAIN = 'main';
const HALF = 'half';
const TASTER = 'taster';

function rows(...specs) {
  return specs.map(([key, catalogueType, rank]) => ({
    key,
    catalogueType,
    taster: catalogueType === TASTER,
    rank,
    archived: false
  }));
}

test('Half-Cigars do not consume positions in the Recommendation sequence', () => {
  // Before: the save path knew only a taster boolean, so half-cigars ranked
  // alongside recommendations and a move left gaps like 1, 2, 4, 6, 8.
  const updates = rankingUpdatesForSave(
    rows(
      ['main-1', MAIN, 1], ['half-1', HALF, 1], ['main-2', MAIN, 2],
      ['half-2', HALF, 2], ['main-3', MAIN, 3], ['main-4', MAIN, 4]
    ),
    {},
    { key: 'main-4', targetCatalogueType: MAIN, stateVersion: 3, targetRank: 2, now: '2026-09-14T00:00:00.000Z' }
  );

  const mainRanks = ['main-1', 'main-4', 'main-2', 'main-3'].map(k => updates[k]?.rank);
  assert.deepEqual(mainRanks, [1, 2, 3, 4], 'the Recommendation cohort must stay contiguous from 1');
  assert.equal(updates['half-1'], undefined, 'a Recommendation move must not rewrite Half-Cigar ranks');
  assert.equal(updates['half-2'], undefined);
});

test('each cohort is ranked independently of the others', () => {
  const source = rows(
    ['main-1', MAIN, 1], ['main-2', MAIN, 2],
    ['half-1', HALF, 1],
    ['taster-1', TASTER, 1], ['taster-2', TASTER, 2]
  );
  const updates = rankingUpdatesForSave(source, {}, {
    key: 'taster-2', targetCatalogueType: TASTER, stateVersion: 3, targetRank: 1, now: '2026-09-14T00:00:00.000Z'
  });
  assert.equal(updates['taster-2'].rank, 1);
  assert.equal(updates['taster-1'].rank, 2);
  assert.equal(updates['main-1'], undefined, 'a taster move must not touch Recommendations');
  assert.equal(updates['half-1'], undefined, 'a taster move must not touch Half-Cigars');
});

test('moving a Recommendation into the Half-Cigar cohort closes the gap it leaves', () => {
  const updates = rankingUpdatesForSave(
    rows(['main-1', MAIN, 1], ['main-2', MAIN, 2], ['main-3', MAIN, 3], ['half-1', HALF, 1]),
    {},
    { key: 'main-2', targetCatalogueType: HALF, stateVersion: 3, targetRank: 1, now: '2026-09-14T00:00:00.000Z' }
  );
  assert.equal(updates['main-1'].rank, 1);
  assert.equal(updates['main-3'].rank, 2, 'main-3 moves up into the vacated slot');
  assert.equal(updates['main-2'].rank, 1);
  assert.equal(updates['main-2'].catalogueType, HALF);
  assert.equal(updates['half-1'].rank, 2);
});

test('v4 Recommendation rank edits still defer to the subsection pipeline', () => {
  const updates = rankingUpdatesForSave(
    rows(['main-1', MAIN, 1], ['main-2', MAIN, 2]),
    {},
    { key: 'main-2', targetCatalogueType: MAIN, stateVersion: 4, targetRank: 1, now: '2026-09-14T00:00:00.000Z' }
  );
  assert.deepEqual(updates, {}, 'the v4 gate must be preserved');
});

test('structural overrides carry catalogueType, with taster kept as a legacy mirror', () => {
  const half = buildStructuralOverride({ brand: 'Toscano', title: 'Antico', catalogueType: HALF });
  assert.equal(half.catalogueType, HALF);
  assert.equal(half.taster, false);

  const taster = buildStructuralOverride({ brand: 'Oliva', title: 'Serie O', catalogueType: TASTER });
  assert.equal(taster.catalogueType, TASTER);
  assert.equal(taster.taster, true);

  const legacy = buildStructuralOverride({ brand: 'Cohiba', title: 'Short', taster: true });
  assert.equal(legacy.catalogueType, TASTER, 'legacy taster:true still resolves to the taster cohort');

  assert.equal(buildStructuralOverride({ brand: 'Liga', title: 'No. 9' }).catalogueType, MAIN);
});

test('legacy v3 state ranks Recommendations by cohort, not by subsection position', () => {
  // With no subsections in KV the subsection branch set max=1 and forced
  // value=1, so the rank field rejected every other number.
  const guard = structureSource.match(/const subsectionsOwnRanking[\s\S]{0,160}?if \(type === 'main' && subsectionsOwnRanking\)/);
  assert.ok(guard, 'the subsection rank model must be gated on subsections actually owning ranking');
  assert.match(structureSource, /Number\(persistedState\.version\) >= 4/);
  assert.match(structureSource, /Array\.isArray\(persistedState\.recommendationSubsections\)/);
});

test('the editor offers all three catalogue types without waiting for a runtime patch', () => {
  const select = adminSource.match(/<select id="catalogue-v139-type">.*?<\/select>/s);
  assert.ok(select, 'catalogue type select must exist in the editor markup');
  for (const value of [MAIN, HALF, TASTER]) {
    assert.match(select[0], new RegExp(`value="${value}"`), `type select must offer ${value}`);
  }
});

test('the editor resolves a three-way catalogue type from card data', () => {
  assert.match(adminSource, /normaliseCatalogueType\(card\.dataset\.catalogueType/);
  assert.equal(
    /taster: card\.dataset\.taster === '1',\s*archived/.test(adminSource),
    false,
    'currentCardRows must not collapse the cohort to a boolean'
  );
  assert.equal(
    /export function reorderCohortOverrides/.test(adminSource),
    false,
    'the superseded two-cohort reorder must not linger as a second implementation'
  );
});

test('the three copies of normaliseCatalogueType have not drifted apart', async () => {
  const modules = ['catalogue-half-cohort', 'catalogue-editor-behaviour', 'catalogue-structure'];
  const bodies = [];
  for (const name of modules) {
    const source = await readFile(new URL(`../public/${name}.mjs`, import.meta.url), 'utf8');
    const fn = source.match(/export function normaliseCatalogueType[\s\S]*?\n\}/);
    assert.ok(fn, `${name} must define normaliseCatalogueType`);
    bodies.push(fn[0].replace(/\s+/g, ' ').trim());
  }
  for (let i = 1; i < bodies.length; i += 1) {
    assert.equal(bodies[i], bodies[0], `${modules[i]} has drifted from ${modules[0]}`);
  }
});
