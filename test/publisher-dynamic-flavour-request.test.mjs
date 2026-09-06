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

test('new dynamic entries keep flavour in card overrides without requiring Worker entry storage', async () => {
  const state = { version: 3, cards: {}, sections: {}, entries: {} };
  let savedEntry;
  let writtenState;

  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-entry/new-dynamic`, response: ({ options }) => {
      const submitted = JSON.parse(options.body);
      const { flavour, ...workerNormalisedEntry } = submitted;
      savedEntry = workerNormalisedEntry;
      return jsonResponse({ ok: true, entry: savedEntry });
    } },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-entry/new-dynamic`, response: () => jsonResponse(savedEntry) },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...state, cards: writtenState.cards, entries: { 'new-dynamic': savedEntry } }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=new-dynamic`, response: new Response('<article class="card" data-key="new-dynamic"></article>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];

  await publishRequestDocument({
    operation: 'upsert-entry',
    key: 'new-dynamic',
    entry: {
      brand: 'Brand',
      title: 'New Dynamic',
      rank: 1,
      taster: true,
      archived: false,
      quality: 8,
      strength: 9,
      flavour: 9
    }
  }, {
    fetchImpl: createFetchRouter(routes),
    baseUrl: BASE,
    token: TOKEN,
    now: () => new Date('2026-09-06T10:45:00Z')
  });

  assert.equal(writtenState.cards['new-dynamic'].flavour, 9);
  assert.equal('flavour' in savedEntry, false);
});
