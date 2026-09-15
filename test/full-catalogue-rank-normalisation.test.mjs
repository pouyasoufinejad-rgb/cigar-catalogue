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
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse(writtenState) },
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
  assert.deepEqual(writtenState.sections.recommendationSubsections[0].entryKeys, ['a', 'c']);
});

test('static seeding reads an exact Flavoured production line even when it is not the first production line', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'catalogue-flavoured-seed-'));
  const publicDir = join(repoRoot, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(join(publicDir, 'index.html'), `
    <div id="flat-main">
      <article class="card" data-key="plain" data-rank="1">
        <div class="facts"><div><b>4″ × 32</b></div></div>
        <div class="artmeta-left"><div class="artmeta-line">Handmade</div><div class="artmeta-line">Natural</div></div>
      </article>
      <article class="card" data-key="sweet" data-rank="2">
        <div class="facts"><div><b>4″ × 32</b></div></div>
        <div class="artmeta-left"><div class="artmeta-line">Handmade</div><div class="artmeta-line">Flavoured</div></div>
      </article>
    </div>
  `);

  const state = { version: 3, sections: {}, entries: {}, cards: { plain: { rank: 1 }, sweet: { rank: 2 } } };
  let writtenState;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse(writtenState) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=plain`, response: new Response('<article class="card" data-key="plain"></article>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];

  await publishRequestDocument({ operation: 'upsert-entry', key: 'plain', entry: { quality: 8 } }, {
    fetchImpl: createFetchRouter(routes), baseUrl: BASE, token: TOKEN, repoRoot,
    now: () => new Date('2026-09-15T00:00:00Z')
  });

  assert.deepEqual(writtenState.sections.recommendationSubsections[0].entryKeys, ['plain']);
  assert.deepEqual(writtenState.sections.recommendationSubsections[2].entryKeys, ['sweet']);
  assert.equal(writtenState.cards.sweet.subsection, 'flavoured-infused');
});
