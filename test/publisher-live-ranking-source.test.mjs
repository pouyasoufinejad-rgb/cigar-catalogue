import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { publishLiveCatalogueRequestFile } from '../scripts/publish-live-catalogue-request.mjs';

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

test('production ranking completion uses live Worker HTML instead of stale repository HTML', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'catalogue-live-source-regression-'));
  const publicDir = join(repoRoot, 'public');
  const requestDir = join(repoRoot, 'catalogue-requests');
  await mkdir(publicDir, { recursive: true });
  await mkdir(requestDir, { recursive: true });

  const staleHtml = `
    <div id="flat-main">
      <article class="card" data-key="a" data-rank="1"></article>
      <article class="card" data-key="b" data-rank="2"></article>
      <article class="card" data-key="c" data-rank="3"></article>
    </div>
  `;
  await writeFile(join(publicDir, 'index.html'), staleHtml);

  const requestPath = 'catalogue-requests/live-safe-test.json';
  await writeFile(join(repoRoot, requestPath), JSON.stringify({
    operation: 'upsert-entry',
    key: 'd',
    entry: {
      brand: 'Brand',
      title: 'New live-safe entry',
      rank: 2,
      strength: 8,
      quality: 8,
      risk: 1,
      price: 20,
      packagePrice: 20,
      packageLabel: 'single cigar',
      country: 'Nicaragua',
      length: 6,
      ring: 46,
      taster: false,
      archived: false
    }
  }));

  const state = {
    version: 3,
    sections: {},
    entries: {},
    cards: {
      b: { rank: 2, archived: false, taster: false, quality: 8 }
    }
  };

  const liveHtml = `
    <div id="flat-main">
      <article class="card" data-key="c" data-rank="1"></article>
      <article class="card" data-key="b" data-rank="2"></article>
      <article class="card" data-key="a" data-rank="3"></article>
    </div>
  `;

  let writtenEntry;
  let writtenState;
  const routes = [
    { method: 'GET', url: `${BASE}/?catalogue_source=rankings`, response: new Response(liveHtml, { status: 200, headers: { 'content-type': 'text/html' } }) },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-entry/d`, response: ({ options }) => {
      writtenEntry = JSON.parse(options.body);
      return jsonResponse({ ok: true, entry: writtenEntry });
    } },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-entry/d`, response: () => jsonResponse(writtenEntry) },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({
      ...state,
      cards: writtenState.cards,
      entries: { d: writtenEntry }
    }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=d`, response: new Response(
      '<article class="card" data-key="d" data-rank="2"></article>',
      { status: 200, headers: { 'content-type': 'text/html' } }
    ) }
  ];

  await publishLiveCatalogueRequestFile(requestPath, {
    fetchImpl: createFetchRouter(routes),
    baseUrl: BASE,
    token: TOKEN,
    repoRoot,
    now: () => new Date('2026-09-08T00:00:00Z')
  });

  assert.equal(writtenState.cards.c.rank, 1);
  assert.equal(writtenState.cards.d.rank, 2);
  assert.equal(writtenState.cards.b.rank, 3);
  assert.equal(writtenState.cards.a.rank, 4);
  assert.equal(await readFile(join(publicDir, 'index.html'), 'utf8'), staleHtml);
});
