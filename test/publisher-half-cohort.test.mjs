import test from 'node:test';
import assert from 'node:assert/strict';
import { publishRequestDocument } from '../scripts/publish-catalogue-request.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const TOKEN = 'test-token';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function router(routes) {
  return async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const route = routes.find(item => item.method === method && item.url === String(url));
    if (!route) throw new Error(`Unexpected ${method} ${url}`);
    return typeof route.response === 'function' ? route.response({ options }) : route.response;
  };
}

test('publisher can move a recommendation into Half-Cigar without mixing main and H ranks', async () => {
  const initial = {
    version: 3,
    sections: {},
    entries: {},
    cards: {
      'main-a': { rank: 1, taster: false, catalogueType: 'main', archived: false },
      'move-me': { rank: 2, taster: false, catalogueType: 'main', archived: false },
      'main-b': { rank: 3, taster: false, catalogueType: 'main', archived: false },
      'half-a': { rank: 1, taster: false, catalogueType: 'half', archived: false },
      'taster-a': { rank: 1, taster: true, catalogueType: 'taster', archived: false }
    }
  };
  let written;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: json(initial) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      written = JSON.parse(options.body);
      return json({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => json({ ...initial, cards: written.cards }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=move-me`, response: new Response('<article class="card" data-key="move-me"></article>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];

  await publishRequestDocument({
    operation: 'upsert-entry',
    key: 'move-me',
    entry: { catalogueType: 'half', taster: false, rank: 2 }
  }, {
    fetchImpl: router(routes),
    baseUrl: BASE,
    token: TOKEN,
    includeStaticCatalogue: false,
    sleep: async () => {}
  });

  assert.equal(written.cards['main-a'].rank, 1);
  assert.equal(written.cards['main-b'].rank, 2);
  assert.equal(written.cards['half-a'].rank, 1);
  assert.equal(written.cards['move-me'].rank, 2);
  assert.equal(written.cards['move-me'].catalogueType, 'half');
  assert.equal(written.cards['taster-a'].rank, 1);
});
