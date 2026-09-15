import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

test('Worker injects a versioned runtime bootstrap so repaired editor code bypasses stale browser caches', () => {
  assert.match(worker, /src=\"\/catalogue-runtime\.mjs\?v=141\"/);
});

test('cache-busted runtime keeps the legacy direct editor retired', () => {
  assert.doesNotMatch(runtime, /catalogue-direct-edit\.mjs/);
});

test('runtime version-busts the recommendation subsection module containing the editor hotfix', () => {
  assert.match(runtime, /import\(['"]\.\/catalogue-recommendation-subsections\.mjs\?v=editor-focus-1['"]\)/);
});

// These checks intentionally pin the outer runtime key and editor ownership so this repair cannot silently regress.
