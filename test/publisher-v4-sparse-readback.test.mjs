import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { publishRequestDocument } from '../scripts/publish-catalogue-request.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const TOKEN = 'test-token';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function migrationRequest() {
  return {
    operation: 'update-recommendation-subsections',
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '34 ring gauge or lower.', entryKeys: ['rec'] }
    ]
  };
}

async function createMigrationFixture(html, state) {
  const repoRoot = await mkdtemp(join(tmpdir(), 'catalogue-v4-readback-'));
  await mkdir(join(repoRoot, 'public'), { recursive: true });
  await writeFile(join(repoRoot, 'public', 'index.html'), html, 'utf8');
  let writtenState;
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET' && href === `${BASE}/api/catalogue-overrides`) return jsonResponse(state);
    if (method === 'PUT' && href === `${BASE}/api/catalogue-overrides`) {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    }
    if (method === 'GET' && href === `${BASE}/api/catalogue-overrides?verify=1`) {
      return jsonResponse({ ...state, ...writtenState });
    }
    if (method === 'GET' && href === `${BASE}/?catalogue_verify=recommendation-subsections`) {
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    throw new Error(`Unexpected request: ${method} ${href}`);
  };
  return { repoRoot, fetchImpl, getWrittenState: () => writtenState };
}

test('v4 migration validates Half and Taster ranks against the complete catalogue, not sparse KV overrides', async () => {
  const html = `
    <article class="card" data-key="rec" data-catalogue-type="main" data-rank="1"></article>
    <article class="card" data-key="t1" data-catalogue-type="taster" data-taster="1" data-rank="1"></article>
    <article class="card" data-key="t2" data-catalogue-type="taster" data-taster="1" data-rank="2"></article>`;
  const state = {
    version: 3,
    cards: {
      t2: { catalogueType: 'taster', taster: true, archived: false, rank: 2 }
    },
    sections: {},
    entries: {}
  };
  const fixture = await createMigrationFixture(html, state);
  const result = await publishRequestDocument(migrationRequest(), {
    fetchImpl: fixture.fetchImpl,
    baseUrl: BASE,
    token: TOKEN,
    repoRoot: fixture.repoRoot,
    sleep: async () => {}
  });

  assert.deepEqual(result, {
    ok: true,
    operation: 'update-recommendation-subsections',
    target: 'recommendation-subsections',
    verified: true
  });
  assert.equal(fixture.getWrittenState().version, 4);
  assert.equal(fixture.getWrittenState().cards.t2.rank, 2);
});

test('v4 migration does not treat a stale static rank as active when KV marks the card archived', async () => {
  const html = `
    <article class="card" data-key="rec" data-catalogue-type="main" data-rank="1"></article>
    <article class="card" data-key="archived" data-catalogue-type="main" data-rank="2"></article>`;
  const state = {
    version: 3,
    cards: {
      archived: { catalogueType: 'main', taster: false, archived: true }
    },
    sections: {},
    entries: {}
  };
  const fixture = await createMigrationFixture(html, state);

  const result = await publishRequestDocument(migrationRequest(), {
    fetchImpl: fixture.fetchImpl,
    baseUrl: BASE,
    token: TOKEN,
    repoRoot: fixture.repoRoot,
    sleep: async () => {}
  });

  assert.equal(result.verified, true);
  assert.equal(fixture.getWrittenState().cards.archived.archived, true);
  assert.equal('rank' in fixture.getWrittenState().cards.archived, false);
});
