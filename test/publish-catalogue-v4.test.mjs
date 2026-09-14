import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseStateShape,
  publishRequestDocument,
  validateRequest
} from '../scripts/publish-catalogue-request.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const TOKEN = 'test-token';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function router(routes, calls = []) {
  return async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const href = String(url);
    calls.push({ href, method, body: options.body, headers: new Headers(options.headers || {}) });
    const route = routes.find(item => item.method === method && item.url === href);
    if (!route) throw new Error(`Unexpected ${method} ${href}`);
    return typeof route.response === 'function' ? route.response({ options, href, method }) : route.response;
  };
}

function v4State(overrides = {}) {
  return {
    version: 4,
    cards: {
      a: { catalogueType: 'main', taster: false, archived: false, rank: 8, quality: 7 },
      b: { catalogueType: 'main', taster: false, archived: false, rank: 2, quality: 6 },
      h1: { catalogueType: 'half', taster: false, archived: false, rank: 1 },
      t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
    },
    sections: {},
    entries: {},
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] },
      { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: ['b'] },
      { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: [] }
    ],
    ...overrides
  };
}

test('normaliseStateShape preserves explicit v4 subsection state', () => {
  const state = v4State();
  const result = normaliseStateShape(state);
  assert.equal(result.version, 4);
  assert.deepEqual(result.recommendationSubsections, state.recommendationSubsections);
});

test('v4 quality-only edit preserves subsection arrays and does not compact legacy main ranks', async () => {
  const state = v4State();
  let written;
  const calls = [];
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: json(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      written = JSON.parse(options.body);
      return json({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => json({ ...state, ...written }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=a`, response: new Response('<article class="card" data-key="a"></article>', { status: 200 }) }
  ];

  await publishRequestDocument({ operation: 'upsert-entry', key: 'a', entry: { quality: 9 } }, {
    fetchImpl: router(routes, calls), baseUrl: BASE, token: TOKEN, includeStaticCatalogue: false, sleep: async () => {}
  });

  assert.equal(written.version, 4);
  assert.deepEqual(written.recommendationSubsections, state.recommendationSubsections);
  assert.equal(written.cards.a.quality, 9);
  assert.equal(written.cards.a.rank, 8);
  assert.equal(written.cards.b.rank, 2);
  assert.equal(written.cards.h1.rank, 1);
  assert.equal(written.cards.t1.rank, 1);
});

test('migration operation writes full validated v4 subsection arrays and verifies read-back', async () => {
  const initial = {
    version: 3,
    cards: {
      a: { catalogueType: 'main', rank: 1, archived: false },
      b: { catalogueType: 'main', rank: 2, archived: false },
      h1: { catalogueType: 'half', rank: 1, archived: false }
    },
    sections: {}, entries: {}
  };
  const subsections = [
    { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] },
    { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: ['b'] },
    { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: [] }
  ];
  let written;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: json(initial) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      written = JSON.parse(options.body); return json({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => json({ ...initial, ...written }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=recommendation-subsections`, response: new Response('<article class="card" data-key="a"></article>', { status: 200 }) }
  ];

  const result = await publishRequestDocument({
    operation: 'update-recommendation-subsections', recommendationSubsections: subsections
  }, {
    fetchImpl: router(routes), baseUrl: BASE, token: TOKEN, includeStaticCatalogue: false, sleep: async () => {}
  });

  assert.equal(result.target, 'recommendation-subsections');
  assert.equal(written.version, 4);
  assert.deepEqual(written.recommendationSubsections, subsections);
  assert.equal(written.cards.a.rank, 1, 'migration must not rewrite unrelated card fields');
  assert.equal(written.cards.h1.rank, 1);
});

test('v4 archive removes Recommendation membership without touching unrelated H/T ranks', async () => {
  const state = v4State();
  let written;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: json(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => { written = JSON.parse(options.body); return json({ ok: true }); } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => json({ ...state, ...written }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=a`, response: new Response('<article class="card" data-key="a" data-archived="1"></article>', { status: 200 }) }
  ];

  await publishRequestDocument({ operation: 'archive-entry', key: 'a' }, {
    fetchImpl: router(routes), baseUrl: BASE, token: TOKEN, includeStaticCatalogue: false, sleep: async () => {},
    now: () => new Date('2026-09-14T12:00:00Z')
  });

  assert.deepEqual(written.recommendationSubsections[0].entryKeys, []);
  assert.equal(written.cards.a.archived, true);
  assert.equal('rank' in written.cards.a, false);
  assert.equal(written.cards.h1.rank, 1);
  assert.equal(written.cards.t1.rank, 1);
});

test('v4 unarchive requires an explicit destination', async () => {
  const state = v4State({
    cards: {
      a: { catalogueType: 'main', archived: true, archivedAt: '2026-09-13T00:00:00Z' },
      b: { catalogueType: 'main', archived: false, rank: 2 },
      h1: { catalogueType: 'half', archived: false, rank: 1 },
      t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
    },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: [] },
      { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: ['b'] },
      { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: [] }
    ]
  });
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: json(state) }
  ];
  await assert.rejects(
    publishRequestDocument({ operation: 'unarchive-entry', key: 'a' }, {
      fetchImpl: router(routes), baseUrl: BASE, token: TOKEN, includeStaticCatalogue: false
    }),
    /explicit destination/i
  );
});

test('v4 explicit move from Recommendation to Half uses destination position and leaves Taster unchanged', async () => {
  const state = v4State();
  let written;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: json(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => { written = JSON.parse(options.body); return json({ ok: true }); } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => json({ ...state, ...written }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=a`, response: new Response('<article class="card" data-key="a"></article>', { status: 200 }) }
  ];

  await publishRequestDocument({
    operation: 'upsert-entry', key: 'a', entry: {},
    destination: { type: 'half', position: 2 }
  }, {
    fetchImpl: router(routes), baseUrl: BASE, token: TOKEN, includeStaticCatalogue: false, sleep: async () => {}
  });

  assert.deepEqual(written.recommendationSubsections[0].entryKeys, []);
  assert.equal(written.cards.h1.rank, 1);
  assert.equal(written.cards.a.catalogueType, 'half');
  assert.equal(written.cards.a.rank, 2);
  assert.equal(written.cards.t1.rank, 1);
});

test('v4 explicit move from Half to Recommendation compacts Half and inserts in requested subsection', async () => {
  const state = v4State({
    cards: {
      a: { catalogueType: 'main', archived: false, rank: 8 },
      b: { catalogueType: 'main', archived: false, rank: 2 },
      h1: { catalogueType: 'half', archived: false, rank: 1 },
      h2: { catalogueType: 'half', archived: false, rank: 2 },
      t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
    },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] },
      { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: ['b'] },
      { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: [] }
    ]
  });
  let written;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: json(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => { written = JSON.parse(options.body); return json({ ok: true }); } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => json({ ...state, ...written }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=h1`, response: new Response('<article class="card" data-key="h1"></article>', { status: 200 }) }
  ];

  await publishRequestDocument({
    operation: 'upsert-entry', key: 'h1', entry: {},
    destination: { type: 'main', subsectionId: 'coronets', position: 2 }
  }, {
    fetchImpl: router(routes), baseUrl: BASE, token: TOKEN, includeStaticCatalogue: false, sleep: async () => {}
  });

  assert.deepEqual(written.recommendationSubsections[0].entryKeys, ['a', 'h1']);
  assert.equal(written.cards.h1.catalogueType, 'main');
  assert.equal('rank' in written.cards.h1, false);
  assert.equal(written.cards.h2.rank, 1);
  assert.equal(written.cards.t1.rank, 1);
});

test('v4 destination schema is explicit and validated', () => {
  assert.throws(() => validateRequest({ operation: 'upsert-entry', key: 'a', entry: {}, destination: { type: 'main', position: 1 } }), /subsectionId/);
  const request = validateRequest({ operation: 'upsert-entry', key: 'a', entry: {}, destination: { type: 'main', subsectionId: 'coronets', position: 2 } });
  assert.deepEqual(request.destination, { type: 'main', subsectionId: 'coronets', position: 2 });
});
