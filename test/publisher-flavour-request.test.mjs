import test from 'node:test';
import assert from 'node:assert/strict';

import { publishRequestDocument } from '../scripts/publish-catalogue-request.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const TOKEN = 'test-token-do-not-log';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function createFetchRouter(routes) {
  return async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const href = String(url);
    const route = routes.find(item => item.method === method && item.url === href);
    if (!route) throw new Error(`Unexpected request: ${method} ${href}`);
    return typeof route.response === 'function' ? route.response({ options }) : route.response;
  };
}

test('upsert-entry preserves flavour in card overrides', async () => {
  const state = {
    version: 3,
    cards: {
      'static-one': { rank: 1, archived: false, taster: false, quality: 8 }
    },
    sections: {},
    entries: {}
  };
  let writtenState;

  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...state, cards: writtenState.cards }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=static-one`, response: new Response('<article class="card" data-key="static-one"></article>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];

  await publishRequestDocument({
    operation: 'upsert-entry',
    key: 'static-one',
    entry: { flavour: 9 }
  }, {
    fetchImpl: createFetchRouter(routes),
    baseUrl: BASE,
    token: TOKEN,
    now: () => new Date('2026-09-06T04:00:00Z')
  });

  assert.equal(writtenState.cards['static-one'].flavour, 9);
});
