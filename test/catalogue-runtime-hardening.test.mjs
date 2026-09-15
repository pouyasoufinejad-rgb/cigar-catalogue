import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(new URL(path, import.meta.url), 'utf8').catch(() => '');

test('browser runtime bootstrap is separate from the pure Value module', async () => {
  const valueSource = await read('../public/catalogue-value.mjs');
  const runtimeSource = await read('../public/catalogue-runtime.mjs');

  assert.ok(runtimeSource, 'catalogue-runtime.mjs must exist');
  assert.doesNotMatch(valueSource, /import\(['"]\.\/catalogue-[^'"]+\.mjs['"]\)/);
  assert.doesNotMatch(valueSource, /\btypeof document\b|\bdocument\./);

  for (const moduleName of [
    'catalogue-direct-edit.mjs',
    'catalogue-direct-persistence.mjs',
    'catalogue-flavour.mjs',
    'catalogue-card-layout.mjs',
    'catalogue-legacy-copy.mjs',
    'catalogue-size-presentation.mjs',
    'catalogue-presentation.mjs',
    'catalogue-half-cohort.mjs',
    'catalogue-editor-behaviour.mjs',
    'catalogue-convenience.mjs',
    'catalogue-convenience-refinements.mjs'
  ]) {
    assert.match(runtimeSource, new RegExp(moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Worker HTML transform injects the runtime bootstrap exactly once', async () => {
  const worker = await import('../src/index.js');
  assert.equal(typeof worker.injectRuntimeBootstrap, 'function');

  const original = '<!doctype html><html><head></head><body><main>Catalogue</main></body></html>';
  const once = worker.injectRuntimeBootstrap(original);
  const twice = worker.injectRuntimeBootstrap(once);

  assert.match(once, /<script type="module" src="\/catalogue-runtime\.mjs"><\/script><\/body>/);
  assert.equal((once.match(/catalogue-runtime\.mjs/g) || []).length, 1);
  assert.equal(twice, once);
});

test('GitHub verification runs for public frontend changes on pull requests and main pushes', async () => {
  const workflow = await read('../.github/workflows/publish-catalogue.yml');
  const matches = workflow.match(/- ['"]?public\/\*\*['"]?/g) || [];
  assert.equal(matches.length, 2, 'public/** must be included in both pull_request and push path filters');
});
