import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerCore = await readFile(new URL('../src/index-core.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const ASSET_VERSION = '20260914-v4';

test('Worker injects a cache-busted top-level runtime module', () => {
  assert.match(workerCore, new RegExp(`catalogue-runtime\\.mjs\\?v=${ASSET_VERSION}`));
});

test('runtime cache-busts imported modules so stale pre-v4 code cannot survive a reload', () => {
  const imports = [...runtime.matchAll(/(?:await\s+)?import\(['"](\.\/[^'"]+\.mjs)(?:\?v=([^'"]+))?['"]\)/g)];
  assert.ok(imports.length >= 10, 'expected catalogue runtime module imports');
  for (const [, path, version] of imports) {
    assert.equal(version, ASSET_VERSION, `${path} is not pinned to the v4 asset version`);
  }
  assert.ok(imports.some(([, path]) => path.endsWith('catalogue-recommendation-subsections.mjs')));
  assert.ok(imports.some(([, path]) => path.endsWith('catalogue-structure-editor.mjs')));
});
