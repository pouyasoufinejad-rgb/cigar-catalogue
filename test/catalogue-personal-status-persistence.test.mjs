import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import worker from '../src/worker.js';
import { mergeRemoteStatuses } from '../public/catalogue-personal-status-persistence.mjs';

const persistenceUrl = new URL('../public/catalogue-personal-status-persistence.mjs', import.meta.url);
const runtimeUrl = new URL('../public/catalogue-runtime.mjs', import.meta.url);

function memoryKv(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    async get(key, type) {
      const value = values.get(key) ?? null;
      if (value == null) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      values.set(key, String(value));
    }
  };
}

test('personal status API reads persisted statuses from KV', async () => {
  const env = {
    CATALOGUE_STATE: memoryKv({
      'catalogue-personal-statuses-v1': JSON.stringify({
        version: 1,
        updatedAt: '2026-09-14T00:00:00.000Z',
        statuses: {
          'liga-no9': { owned: true, tried: true, want: false, rebuy: true }
        }
      })
    })
  };

  const response = await worker.fetch(new Request('https://catalogue.test/api/personal-statuses'), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.statuses['liga-no9'], {
    owned: true,
    tried: true,
    want: false,
    rebuy: true
  });
});

test('personal status API requires admin auth for writes and persists normalised statuses', async () => {
  const kv = memoryKv();
  const env = { CATALOGUE_STATE: kv, ADMIN_TOKEN: 'secret' };
  const url = 'https://catalogue.test/api/personal-statuses';

  const denied = await worker.fetch(new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: 'https://catalogue.test' },
    body: JSON.stringify({ statuses: { one: { owned: true } } })
  }), env);
  assert.equal(denied.status, 401);

  const saved = await worker.fetch(new Request(url, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://catalogue.test',
      authorization: 'Bearer secret'
    },
    body: JSON.stringify({
      statuses: {
        one: { owned: 1, tried: 0, want: true, rebuy: false },
        'bad key!': { owned: true }
      }
    })
  }), env);
  assert.equal(saved.status, 200);

  const reloaded = await worker.fetch(new Request(url), env);
  assert.equal(reloaded.status, 200);
  const payload = await reloaded.json();
  assert.deepEqual(payload.statuses, {
    one: { owned: true, tried: false, want: true, rebuy: false }
  });
});

test('remote personal statuses override matching local cards while preserving unsynced local cards', () => {
  const merged = mergeRemoteStatuses({
    viewMode: 'compact',
    statuses: {
      one: { owned: true, tried: false, want: false, rebuy: false },
      localOnly: { owned: false, tried: true, want: false, rebuy: false }
    }
  }, {
    one: { owned: false, tried: true, want: true, rebuy: false }
  });

  assert.equal(merged.viewMode, 'compact');
  assert.deepEqual(merged.statuses.one, { owned: false, tried: true, want: true, rebuy: false });
  assert.deepEqual(merged.statuses.localonly, { owned: false, tried: true, want: false, rebuy: false });
});

test('browser runtime hydrates durable statuses before loading the convenience UI', async () => {
  const persistenceSource = await readFile(persistenceUrl, 'utf8');
  const runtimeSource = await readFile(runtimeUrl, 'utf8');

  assert.match(persistenceSource, /const PERSONAL_STATUS_API = ['"]\/api\/personal-statuses['"]/);
  assert.match(persistenceSource, /cigar-catalogue-admin-token/);
  assert.match(persistenceSource, /fetchImpl\(PERSONAL_STATUS_API/);
  assert.match(persistenceSource, /method\s*:\s*['"]PUT['"]/);
  assert.match(persistenceSource, /loadPersonalStatuses/);

  const persistenceIndex = runtimeSource.indexOf("await import('./catalogue-personal-status-persistence.mjs')");
  const convenienceIndex = runtimeSource.indexOf('catalogue-convenience.mjs');
  assert.ok(persistenceIndex >= 0);
  assert.ok(convenienceIndex > persistenceIndex);
});
