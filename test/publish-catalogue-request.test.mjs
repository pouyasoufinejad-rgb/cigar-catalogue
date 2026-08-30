import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  validateRequest,
  publishRequestDocument,
  MAX_IMAGE_BYTES
} from '../scripts/publish-catalogue-request.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const TOKEN = 'test-token-do-not-log';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function createFetchRouter(routes, calls) {
  return async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const href = String(url);
    calls.push({ href, method, headers: new Headers(options.headers || {}), body: options.body });
    const route = routes.find(item => item.method === method && item.url === href);
    if (!route) throw new Error(`Unexpected request: ${method} ${href}`);
    return typeof route.response === 'function' ? route.response({ url: href, method, options }) : route.response;
  };
}

function baseState(overrides = {}) {
  return { version: 3, cards: {}, sections: {}, entries: {}, ...overrides };
}

test('validateRequest rejects unsafe keys and unsupported operations', () => {
  assert.throws(() => validateRequest({ operation: 'upsert-entry', key: '../bad', entry: {} }), /Invalid catalogue key/);
  assert.throws(() => validateRequest({ operation: 'delete-entry', key: 'safe-key' }), /Unsupported operation/);
  assert.equal(validateRequest({ operation: 'upsert-entry', key: 'safe-key', entry: { brand: 'A', title: 'B' } }).key, 'safe-key');
});

test('partial update of an existing dynamic entry preserves unrelated fields and updates cards', async () => {
  const calls = [];
  const existingEntry = {
    key: 'existing-dynamic', brand: 'Brand', title: 'Old title', quality: 7, strength: 6,
    price: 12, packagePrice: 120, packageLabel: 'box of 10', length: 4, ring: 32,
    country: 'Nicaragua', risk: 1, rank: 4, taster: false, archived: false,
    archivedAt: '', experienceTags: ['Keep me'], summaryHtml: 'Old', noteHtml: '',
    productionLines: ['Handmade'], practicalLines: ['Box'], smokeTime: '30 min',
    retailerLinks: ['https://example.com/'], imageUrl: '', imageSourceKey: '', imageVersion: 0,
    stock: 'in', stockPin: '', priceChecked: '2026-08-30', stockChecked: '2026-08-30', size: 'gold'
  };
  const state = baseState({
    entries: { 'existing-dynamic': existingEntry },
    cards: { 'existing-dynamic': { rank: 4, quality: 7, experienceTags: ['Keep me'] } }
  });
  let writtenEntry;
  let writtenState;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-entry/existing-dynamic`, response: ({ options }) => {
      writtenEntry = JSON.parse(options.body);
      return jsonResponse({ ok: true, entry: writtenEntry });
    } },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-entry/existing-dynamic`, response: () => jsonResponse(writtenEntry) },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...state, cards: writtenState.cards, entries: { 'existing-dynamic': writtenEntry } }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=existing-dynamic`, response: new Response('<div id="flat-main"><article class="card" data-key="existing-dynamic"></article></div>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];
  const fetchImpl = createFetchRouter(routes, calls);

  const result = await publishRequestDocument({
    operation: 'upsert-entry', key: 'existing-dynamic', entry: { title: 'New title', quality: 8 }
  }, { fetchImpl, baseUrl: BASE, token: TOKEN, now: () => new Date('2026-08-31T00:00:00Z') });

  assert.equal(result.target, 'dynamic');
  assert.equal(writtenEntry.title, 'New title');
  assert.equal(writtenEntry.quality, 8);
  assert.deepEqual(writtenEntry.experienceTags, ['Keep me']);
  assert.equal(writtenEntry.price, 12);
  assert.equal(writtenState.cards['existing-dynamic'].quality, 8);
  assert.deepEqual(writtenState.cards['existing-dynamic'].experienceTags, ['Keep me']);
  const writeCalls = calls.filter(call => call.method === 'PUT');
  assert.ok(writeCalls.length >= 2);
  for (const call of writeCalls) assert.equal(call.headers.get('authorization'), `Bearer ${TOKEN}`);
});

test('existing static card update writes the complete cards map and does not create a dynamic entry', async () => {
  const calls = [];
  const state = baseState({ cards: {
    'static-one': { rank: 1, quality: 7, summaryHtml: 'Keep' },
    'static-two': { rank: 2, quality: 6 }
  }});
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

  await publishRequestDocument({ operation: 'upsert-entry', key: 'static-one', entry: { quality: 9 } }, {
    fetchImpl: createFetchRouter(routes, calls), baseUrl: BASE, token: TOKEN, now: () => new Date('2026-08-31T00:00:00Z')
  });

  assert.equal(writtenState.cards['static-one'].quality, 9);
  assert.equal(writtenState.cards['static-one'].summaryHtml, 'Keep');
  assert.equal(writtenState.cards['static-two'].quality, 6);
  assert.equal(calls.some(call => call.href.includes('/api/catalogue-entry/')), false);
});

test('archive removes active rank, stores archivedRank, and compacts the active cohort', async () => {
  const calls = [];
  const state = baseState({ cards: {
    a: { rank: 1, archived: false, taster: false },
    b: { rank: 2, archived: false, taster: false },
    c: { rank: 3, archived: false, taster: false }
  }});
  let writtenState;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body); return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...state, cards: writtenState.cards }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=b`, response: new Response('<article data-key="b" data-archived="1"></article>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];

  await publishRequestDocument({ operation: 'archive-entry', key: 'b' }, {
    fetchImpl: createFetchRouter(routes, calls), baseUrl: BASE, token: TOKEN, now: () => new Date('2026-08-31T00:00:00Z')
  });

  assert.equal(writtenState.cards.b.archived, true);
  assert.equal(writtenState.cards.b.archivedRank, 2);
  assert.equal('rank' in writtenState.cards.b, false);
  assert.equal(writtenState.cards.a.rank, 1);
  assert.equal(writtenState.cards.c.rank, 2);
});

test('any catalogue write normalises legacy archived ranks and active cohort gaps', async () => {
  const calls = [];
  const state = baseState({ cards: {
    a: { rank: 1, archived: false, taster: false, quality: 7 },
    old: { rank: 2, archived: true, archivedRank: 2, taster: false },
    c: { rank: 4, archived: false, taster: false },
    t1: { rank: 2, archived: false, taster: true },
    tOld: { rank: 1, archived: true, archivedRank: 1, taster: true },
    t2: { rank: 5, archived: false, taster: true }
  }});
  let writtenState;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body); return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...state, cards: writtenState.cards }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=a`, response: new Response('<article data-key="a"></article>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];

  await publishRequestDocument({ operation: 'upsert-entry', key: 'a', entry: { quality: 8 } }, {
    fetchImpl: createFetchRouter(routes, calls), baseUrl: BASE, token: TOKEN, now: () => new Date('2026-08-31T00:00:00Z')
  });

  assert.equal('rank' in writtenState.cards.old, false);
  assert.equal('rank' in writtenState.cards.tOld, false);
  assert.deepEqual([writtenState.cards.a.rank, writtenState.cards.c.rank], [1, 2]);
  assert.deepEqual([writtenState.cards.t1.rank, writtenState.cards.t2.rank], [1, 2]);
});

test('unarchive restores the saved archived rank and shifts active entries around it', async () => {
  const calls = [];
  const state = baseState({ cards: {
    a: { rank: 1, archived: false, taster: false },
    b: { archived: true, archivedRank: 2, archivedAt: '2026-08-30T00:00:00Z', taster: false },
    c: { rank: 2, archived: false, taster: false }
  }});
  let writtenState;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body); return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...state, cards: writtenState.cards }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=b`, response: new Response('<article data-key="b"></article>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];

  await publishRequestDocument({ operation: 'unarchive-entry', key: 'b' }, {
    fetchImpl: createFetchRouter(routes, calls), baseUrl: BASE, token: TOKEN, now: () => new Date('2026-08-31T00:00:00Z')
  });

  assert.equal(writtenState.cards.b.archived, false);
  assert.equal(writtenState.cards.b.rank, 2);
  assert.equal(writtenState.cards.a.rank, 1);
  assert.equal(writtenState.cards.c.rank, 3);
});

test('image upload validates bytes, verifies download, and associates imageUrl', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalogue-publisher-'));
  const requestDir = join(dir, 'catalogue-requests');
  const assetDir = join(requestDir, 'assets');
  await import('node:fs/promises').then(fs => fs.mkdir(assetDir, { recursive: true }));
  const imagePath = join(assetDir, 'tiny.png');
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  await writeFile(imagePath, pngBytes);

  const calls = [];
  const state = baseState({ entries: {
    img: { key: 'img', brand: 'B', title: 'T', quality: 5, strength: 5, price: 10, packagePrice: 10,
      packageLabel: 'single', length: 4, ring: 32, country: 'Nicaragua', risk: 1, rank: 1, taster: false,
      archived: false, archivedAt: '', experienceTags: [], summaryHtml: '', noteHtml: '', productionLines: [],
      practicalLines: [], smokeTime: '', retailerLinks: [], imageUrl: '', imageSourceKey: '', imageVersion: 0,
      stock: 'unknown', stockPin: '', priceChecked: '', stockChecked: '', size: 'gold' }
  }, cards: { img: { rank: 1 } } });
  let writtenEntry;
  let writtenState;
  const imageUrlPrefix = '/api/catalogue-image/img?v=';
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-image/img`, response: jsonResponse({ ok: true, key: 'img', bytes: pngBytes.length, contentType: 'image/png' }) },
    { method: 'GET', url: `${BASE}/api/catalogue-image/img`, response: new Response(pngBytes, { status: 200, headers: { 'content-type': 'image/png' } }) },
    { method: 'PUT', url: `${BASE}/api/catalogue-entry/img`, response: ({ options }) => { writtenEntry = JSON.parse(options.body); return jsonResponse({ ok: true, entry: writtenEntry }); } },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => { writtenState = JSON.parse(options.body); return jsonResponse({ ok: true }); } },
    { method: 'GET', url: `${BASE}/api/catalogue-entry/img`, response: () => jsonResponse(writtenEntry) },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...state, cards: writtenState.cards, entries: { img: writtenEntry } }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=img`, response: new Response('<article data-key="img"></article>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];

  await publishRequestDocument({
    operation: 'replace-image', key: 'img', image: { path: 'catalogue-requests/assets/tiny.png', mimeType: 'image/png' }
  }, {
    fetchImpl: createFetchRouter(routes, calls), baseUrl: BASE, token: TOKEN, repoRoot: dir,
    now: () => new Date('2026-08-31T00:00:00Z')
  });

  assert.ok(writtenEntry.imageUrl.startsWith(imageUrlPrefix));
  assert.ok(writtenState.cards.img.imageUrl.startsWith(imageUrlPrefix));
  const upload = calls.find(call => call.method === 'PUT' && call.href.endsWith('/api/catalogue-image/img'));
  assert.equal(upload.headers.get('content-type'), 'image/png');
  assert.equal(upload.headers.get('authorization'), `Bearer ${TOKEN}`);
});

test('image validation rejects unsupported mime and exposes Worker size limit', () => {
  assert.throws(() => validateRequest({ operation: 'replace-image', key: 'x', image: { path: 'catalogue-requests/assets/x.gif', mimeType: 'image/gif' } }), /PNG, JPEG or WebP/);
  assert.equal(MAX_IMAGE_BYTES, 12 * 1024 * 1024);
});

test('live render absence is a hard failure and does not leak the token', async () => {
  const calls = [];
  const state = baseState({ cards: { x: { rank: 1, quality: 5 } } });
  let writtenState;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => { writtenState = JSON.parse(options.body); return jsonResponse({ ok: true }); } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...state, cards: writtenState.cards }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=x`, response: new Response('<html>missing</html>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  ];

  await assert.rejects(
    publishRequestDocument({ operation: 'upsert-entry', key: 'x', entry: { quality: 6 } }, {
      fetchImpl: createFetchRouter(routes, calls), baseUrl: BASE, token: TOKEN, now: () => new Date('2026-08-31T00:00:00Z')
    }),
    error => {
      assert.match(error.message, /not represented in production HTML/);
      assert.equal(error.message.includes(TOKEN), false);
      return true;
    }
  );
});

test('production verification retries a transient Worker resource-limit response', async () => {
  const calls = [];
  const delays = [];
  const state = baseState({ cards: { x: { rank: 1, quality: 5 } } });
  let writtenState;
  let renderAttempts = 0;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => { writtenState = JSON.parse(options.body); return jsonResponse({ ok: true }); } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...state, cards: writtenState.cards }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=x`, response: () => {
      renderAttempts += 1;
      if (renderAttempts === 1) return new Response('Worker exceeded resource limits', { status: 503 });
      return new Response('<article data-key="x"></article>', { status: 200, headers: { 'content-type': 'text/html' } });
    } }
  ];

  const result = await publishRequestDocument(
    { operation: 'upsert-entry', key: 'x', entry: { quality: 6 } },
    {
      fetchImpl: createFetchRouter(routes, calls),
      baseUrl: BASE,
      token: TOKEN,
      now: () => new Date('2026-08-31T00:00:00Z'),
      sleep: async milliseconds => delays.push(milliseconds)
    }
  );

  assert.equal(result.verified, true);
  assert.equal(renderAttempts, 2);
  assert.deepEqual(delays, [2000]);
});

test('API failure text redacts the admin token', async () => {
  const calls = [];
  const state = baseState({ cards: { x: { rank: 1, quality: 5 } } });
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: new Response(`bad token ${TOKEN}`, { status: 401 }) }
  ];

  await assert.rejects(
    publishRequestDocument({ operation: 'upsert-entry', key: 'x', entry: { quality: 6 } }, {
      fetchImpl: createFetchRouter(routes, calls), baseUrl: BASE, token: TOKEN, now: () => new Date('2026-08-31T00:00:00Z')
    }),
    error => {
      assert.equal(error.message.includes(TOKEN), false);
      assert.match(error.message, /REDACTED/);
      return true;
    }
  );
});
