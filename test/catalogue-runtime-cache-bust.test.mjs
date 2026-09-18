import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

test('Worker injects a versioned runtime bootstrap so repaired editor code bypasses stale browser caches', () => {
  assert.match(worker, /src=\"\/catalogue-runtime\.mjs\?v=142\"/);
});

test('cache-busted runtime restores the direct editor', () => {
  assert.match(runtime, /import\(['"]\.\/catalogue-direct-edit\.mjs\?v=editor-repair-1['"]\)/);
});

test('runtime version-busts the recommendation subsection module containing the observer repair', () => {
  assert.match(runtime, /import\(['"]\.\/catalogue-recommendation-subsections\.mjs\?v=editor-repair-2['"]\)/);
});

test('runtime version-busts the half-cohort module containing the rank-bound repair', () => {
  assert.match(runtime, /import\(['"]\.\/catalogue-half-cohort\.mjs\?v=editor-repair-1['"]\)/);
});

// These checks intentionally pin the outer runtime key and editor ownership so this repair cannot silently regress.
