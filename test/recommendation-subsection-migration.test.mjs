import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCatalogueRows,
  mergeStateIntoRows,
  buildMigrationRequest,
  buildLiveMigrationRequest
} from '../scripts/build-recommendation-subsections-migration.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';

function row(overrides = {}) {
  return {
    key: 'a', catalogueType: 'main', taster: false, archived: false,
    ring: 34, productionText: '', recommendationCohort: '', recommendationRank: null,
    legacyRank: 1, rank: 1, ...overrides
  };
}

test('builder keeps the 34/35 boundary and structured flavoured classification', () => {
  const request = buildMigrationRequest({ rows: [
    row({ key: 'coronet', ring: 34, legacyRank: 2 }),
    row({ key: 'panatela', ring: 35, legacyRank: 1 }),
    row({ key: 'infused', ring: 34, productionText: 'Wrapper: Ecuador. Infused with vanilla.', legacyRank: 3 })
  ] });
  assert.deepEqual(request.recommendationSubsections[0].entryKeys, ['coronet']);
  assert.deepEqual(request.recommendationSubsections[1].entryKeys, ['panatela']);
  assert.deepEqual(request.recommendationSubsections[2].entryKeys, ['infused']);
});

test('matching legacy recommendationRank wins within the same subsection', () => {
  const request = buildMigrationRequest({ rows: [
    row({ key: 'a', recommendationCohort: 'coronets', recommendationRank: 2, legacyRank: 1 }),
    row({ key: 'b', recommendationCohort: 'coronets', recommendationRank: 1, legacyRank: 8 })
  ] });
  assert.deepEqual(request.recommendationSubsections[0].entryKeys, ['b', 'a']);
});

test('mismatched legacy recommendation cohort falls back to global rank', () => {
  const request = buildMigrationRequest({ rows: [
    row({ key: 'a', recommendationCohort: 'petit-panatelas', recommendationRank: 1, legacyRank: 2 }),
    row({ key: 'b', recommendationCohort: 'coronets', recommendationRank: 9, legacyRank: 1 })
  ] });
  assert.deepEqual(request.recommendationSubsections[0].entryKeys, ['a', 'b']);
});

test('KFC Sweet Ponies stays out of flavoured inference', () => {
  const request = buildMigrationRequest({ rows: [
    row({ key: 'kfc-ponies-sweets', ring: 32, productionText: 'Flavoured language appears in production copy.' })
  ] });
  assert.deepEqual(request.recommendationSubsections[0].entryKeys, ['kfc-ponies-sweets']);
  assert.deepEqual(request.recommendationSubsections[2].entryKeys, []);
});

test('Half, Taster and archived entries are excluded from Recommendation arrays', () => {
  const request = buildMigrationRequest({ rows: [
    row({ key: 'main', ring: 34 }),
    row({ key: 'half', catalogueType: 'half', ring: 34 }),
    row({ key: 'taster', catalogueType: 'taster', taster: true, ring: 34 }),
    row({ key: 'archived', archived: true, ring: 34 })
  ] });
  const all = request.recommendationSubsections.flatMap(section => section.entryKeys);
  assert.deepEqual(all, ['main']);
});

test('parser reads production metadata only, so ordinary full-flavoured review prose cannot misclassify Joya Black', () => {
  const html = `
    <article class="card" data-key="joya-black" data-rank="4" data-catalogue-type="main">
      <div class="artframe" data-visual-ring="32"></div>
      <div class="summary">A full-flavoured cigar with dark coffee.</div>
      <div class="artmeta-left"><span>Wrapper: Mexican San Andres</span><span>Binder: Nicaragua</span></div>
    </article>`;
  const [parsed] = parseCatalogueRows(html);
  assert.equal(parsed.ring, 32);
  assert.doesNotMatch(parsed.productionText, /full-flavoured/i);
  const request = buildMigrationRequest({ rows: [parsed] });
  assert.deepEqual(request.recommendationSubsections[0].entryKeys, ['joya-black']);
});

test('state overrides HTML structure without stock changing subsection classification', () => {
  const htmlRows = parseCatalogueRows(`
    <article class="card" data-key="x" data-rank="3" data-catalogue-type="main">
      <div class="artframe" data-visual-ring="35"></div>
      <div class="artmeta-left"><span>Wrapper: Nicaragua</span></div>
    </article>`);
  const rows = mergeStateIntoRows(htmlRows, {
    entries: {},
    cards: { x: { recommendationRank: 1, stockPin: 'out' } }
  });
  const request = buildMigrationRequest({ rows });
  assert.deepEqual(request.recommendationSubsections[1].entryKeys, ['x']);
});

test('exactly-once inventory rejects an active Recommendation that cannot be classified', () => {
  assert.throws(() => buildMigrationRequest({ rows: [row({ key: 'unknown', ring: 0 })] }), /missing.*unknown/i);
});

test('live builder is read-only and returns JSON-ready migration request', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: String(options.method || 'GET').toUpperCase() });
    if (String(url).includes('/api/catalogue-overrides')) {
      return new Response(JSON.stringify({ version: 3, cards: {}, entries: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(`
      <article class="card" data-key="a" data-rank="1" data-catalogue-type="main">
        <div class="artframe" data-visual-ring="34"></div>
        <div class="artmeta-left">Wrapper: Nicaragua</div>
      </article>`, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const request = await buildLiveMigrationRequest({ fetchImpl, baseUrl: BASE });
  assert.equal(request.operation, 'update-recommendation-subsections');
  assert.deepEqual(request.recommendationSubsections[0].entryKeys, ['a']);
  assert.equal(calls.every(call => call.method === 'GET'), true);
});
