import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerCore = await readFile(new URL('../src/index-core.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const ASSET_VERSION = '20260914-v8';

test('Worker injects a cache-busted top-level runtime module', () => {
  assert.match(workerCore, new RegExp(`catalogue-runtime\\.mjs\\?v=${ASSET_VERSION}`));
});

test('runtime forces fresh Recommendation, convenience, and structural editor modules together', () => {
  assert.match(runtime, new RegExp(`import\\(['"]\\.\\/catalogue-convenience\\.mjs\\?v=${ASSET_VERSION}['"]\\)`));
  assert.match(runtime, new RegExp(`import\\(['"]\\.\\/catalogue-recommendation-subsections\\.mjs\\?v=${ASSET_VERSION}['"]\\)`));
  assert.match(runtime, new RegExp(`import\\(['"]\\.\\/catalogue-structure-editor\\.mjs\\?v=${ASSET_VERSION}['"]\\)`));
});
