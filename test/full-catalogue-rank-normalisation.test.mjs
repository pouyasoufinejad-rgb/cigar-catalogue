import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    return typeof route.response === 'function'
      ? route.response({ url: href, method, options })
      : route.response;
  };
}

test('archiving a static card compacts ranks using the complete static catalogue, not only KV overrides', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'catalogue-rank-regression-'));
  const publicDir = join(repoRoot, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(join(publicDir, 'index.html'), `
    <div id="flat-main">
      <article class="card" data-key="a" data-rank="1"></article>
      <article class="card" data-key="b" data-rank="2"></article>
      <article class="card" data-key="c" data-rank="3"></article>
    </div>
  `);

  // This matches production: KV is an override map, so cards a/c do not
  // necessarily exist in state.cards even though they are real static cards.
  const state = {
    version: 3,
    sections: {},
    entries: {},
    cards: {
      b: { rank: 2, archived: false, taster: false }
    }
  };

  let writtenState;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({
      ...state,
      cards: writtenState.cards
    }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=b`, response: new Response(
      '<article class="card" data-key="b" data-archived="1"></article>',
      { status: 200, headers: { 'content-type': 'text/html' } }
    ) }
  ];

  await publishRequestDocument({ operation: 'archive-entry', key: 'b' }, {
    fetchImpl: createFetchRouter(routes),
    baseUrl: BASE,
    token: TOKEN,
    repoRoot,
    now: () => new Date('2026-08-31T00:00:00Z')
  });

  assert.equal(writtenState.cards.a.rank, 1);
  assert.equal(writtenState.cards.b.archived, true);
  assert.equal(writtenState.cards.b.archivedRank, 2);
  assert.equal('rank' in writtenState.cards.b, false);
  assert.equal(writtenState.cards.c.rank, 2);
});
