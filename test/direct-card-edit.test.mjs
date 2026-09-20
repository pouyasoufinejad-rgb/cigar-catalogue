import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const directEdit = await readFile(new URL('../public/catalogue-direct-edit.mjs', import.meta.url), 'utf8').catch(() => '');
const persistence = await readFile(new URL('../public/catalogue-direct-persistence.mjs', import.meta.url), 'utf8').catch(() => '');
const runtimeModule = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const fullEditor = await readFile(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');

test('direct editor is loaded by the runtime and owns Edit catalogue', () => {
  assert.ok(directEdit.length > 0, 'direct editor module must remain present');
  assert.match(runtimeModule, /import\(['"]\.\/catalogue-direct-edit\.mjs\?v=variant-edit-1['"]\)/);
  assert.match(directEdit, /function onToggleCapture\(event\)[\s\S]*?if \(allowModalOpen\) return;[\s\S]*?event\.stopImmediatePropagation\(\);[\s\S]*?enterEditMode\(\)/);
  assert.match(directEdit, /document\.addEventListener\('click', onToggleCapture, \{ capture: true \}\)/);
});

test('full catalogue editor remains reachable from More fields', () => {
  assert.match(directEdit, /function openMoreFields\(\)[\s\S]*?allowModalOpen = true;[\s\S]*?q\('catalogue-admin-toggle'\)\?\.click\(\);[\s\S]*?allowModalOpen = false;[\s\S]*?catalogue-admin-reload/);
  assert.match(fullEditor, /q\('catalogue-admin-toggle'\)\?\.addEventListener\('click', openEditor\)/);
  assert.match(fullEditor, /function openEditor\(\)[\s\S]*?modal\.hidden\s*=\s*false/);
});

test('direct editor patch is limited to inline copy and layout fields', () => {
  const match = directEdit.match(/function directPatch\(card\) \{([\s\S]*?)\n\}/);
  assert.ok(match, 'directPatch must exist');
  const patch = match[1];
  for (const field of ['summaryHtml', 'noteHtml', 'eyebrow', 'experienceTags', 'productionHtml', 'practicalHtml', 'readLayout']) {
    assert.ok(patch.includes(field), `directPatch should include ${field}`);
  }
  for (const field of ['rank', 'subsection', 'catalogueType', 'archived']) {
    assert.doesNotMatch(patch, new RegExp(`\\b${field}\\b`), `directPatch must never write ${field}`);
  }
});

test('direct editor saves against freshly fetched sections', () => {
  assert.match(directEdit, /const state = await fetchState\(\)/);
  assert.match(directEdit, /sections:\{ \.\.\.\(state\.sections \|\| \{\}\) \}/);
});

test('full editor exposes structural product fields rather than only inline text', () => {
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

test('verified layout persistence remains loaded alongside the direct editor', () => {
  assert.match(runtimeModule, /import\('\.\/catalogue-direct-persistence\.mjs\?v=variant-edit-1'\)/);
  assert.match(persistence, /\/api\/catalogue-overrides/);
});

test('saved layout overrides existing important transforms', () => {
  assert.match(persistence, /style\.setProperty\('transform',\s*`translate\(\$\{layout\.imageX\}px, \$\{layout\.imageY\}px\) scale\(\$\{layout\.imageScale \/ 100\}\)`,\s*'important'\)/);
  assert.match(persistence, /style\.setProperty\('transform',\s*`translateY\(\$\{layout\.metaY\}px\)`,\s*'important'\)/);
});

test('saved layout verifies layout fields by reading KV back', () => {
  assert.match(persistence, /verifySavedLayout/);
  assert.match(persistence, /arraysMatch/);
  assert.match(persistence, /activeBlend/);
  assert.match(persistence, /activeVariant/);
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
