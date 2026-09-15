import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const directEdit = await readFile(new URL('../public/catalogue-direct-edit.mjs', import.meta.url), 'utf8').catch(() => '');
const persistence = await readFile(new URL('../public/catalogue-direct-persistence.mjs', import.meta.url), 'utf8').catch(() => '');
const runtimeModule = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const fullEditor = await readFile(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');

test('legacy direct editor remains dormant and cannot intercept Edit catalogue', () => {
  assert.ok(directEdit.length > 0, 'legacy module may remain in the repository for history/rollback');
  assert.doesNotMatch(runtimeModule, /catalogue-direct-edit\.mjs/);
  assert.doesNotMatch(runtimeModule, /initDirectCardEditing/);
});

test('full catalogue editor owns the Edit catalogue button', () => {
  assert.match(fullEditor, /q\('catalogue-admin-toggle'\)\?\.addEventListener\('click', openEditor\)/);
  assert.match(fullEditor, /function openEditor\(\)[\s\S]*?modal\.hidden\s*=\s*false/);
});

test('full editor exposes structural product fields rather than only legacy inline text', () => {
  for (const id of [
    'catalogue-v139-type', 'catalogue-v139-risk', 'catalogue-v139-brand', 'catalogue-v139-title',
    'catalogue-v139-package-price', 'catalogue-v139-package-label', 'catalogue-v139-price',
    'catalogue-v139-country', 'catalogue-v139-length', 'catalogue-v139-ring',
    'catalogue-v139-retailers', 'catalogue-v139-smoke-time', 'catalogue-v139-image'
  ]) {
    assert.ok(fullEditor.includes(id), `full editor should expose ${id}`);
  }
  for (const id of ['catalogue-admin-strength', 'catalogue-admin-quality', 'catalogue-admin-size', 'catalogue-admin-rank', 'catalogue-admin-section']) {
    assert.ok(fullEditor.includes(id), `full editor should expose ${id}`);
  }
});

test('verified layout persistence remains loaded independently of the retired direct editor', () => {
  assert.match(runtimeModule, /import\('\.\/catalogue-direct-persistence\.mjs'\)/);
  assert.match(persistence, /\/api\/catalogue-overrides/);
});

test('saved layout overrides existing important transforms', () => {
  assert.match(persistence, /style\.setProperty\('transform',\s*`translate\(\$\{layout\.imageX\}px, \$\{layout\.imageY\}px\) scale\(\$\{layout\.imageScale \/ 100\}\)`,\s*'important'\)/);
  assert.match(persistence, /style\.setProperty\('transform',\s*`translateY\(\$\{layout\.metaY\}px\)`,\s*'important'\)/);
});

test('saved layout verifies layout fields by reading KV back', () => {
  assert.match(persistence, /verifySavedLayout/);
  assert.match(persistence, /await\s+verifySavedLayout\(key, patch\)/);
  assert.match(persistence, /imageScale/);
  assert.match(persistence, /imageX/);
  assert.match(persistence, /imageY/);
  assert.match(persistence, /metaY/);
});

test('saved layout survives immediate refresh and later DOM card rebuilds', () => {
  assert.match(persistence, /catalogue-direct-layout-v1/);
  assert.match(persistence, /localStorage/);
  assert.match(persistence, /new MutationObserver/);
  assert.match(persistence, /childList:\s*true/);
  assert.match(persistence, /applyCachedLayouts/);
});

test('persistence observer ignores slider output and in-card text mutations', () => {
  assert.match(persistence, /mutationTouchesCatalogueCards/);
  assert.match(persistence, /addedNodes/);
  assert.match(persistence, /removedNodes/);
  assert.match(persistence, /article\.card\[data-key\]/);
  assert.match(persistence, /mutations\.some\(mutationTouchesCatalogueCards\)/);
  assert.doesNotMatch(persistence, /mutations\.some\(mutation => mutation\.type === 'childList'\)/);
});
