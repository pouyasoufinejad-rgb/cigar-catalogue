import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import worker from '../src/index.js';

const convenienceUrl = new URL('../public/catalogue-convenience.mjs', import.meta.url);

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

test('convenience UI hydrates and persists personal statuses through the dedicated API', async () => {
  const source = await readFile(convenienceUrl, 'utf8');
  assert.match(source, /const PERSONAL_STATUS_API = ['"]\/api\/personal-statuses['"]/);
  assert.match(source, /cigar-catalogue-admin-token/);
  assert.match(source, /fetch\(PERSONAL_STATUS_API/);
  assert.match(source, /method\s*:\s*['"]PUT['"]/);
  assert.match(source, /loadPersonalStatuses/);
});
