import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const directEdit = await readFile(new URL('../public/catalogue-direct-edit.mjs', import.meta.url), 'utf8').catch(() => '');
const persistence = await readFile(new URL('../public/catalogue-direct-persistence.mjs', import.meta.url), 'utf8').catch(() => '');
const valueModule = await readFile(new URL('../public/catalogue-value.mjs', import.meta.url), 'utf8');

test('Edit catalogue activates direct card edit mode instead of opening the dropdown modal', () => {
  assert.match(directEdit, /catalogue-admin-toggle/);
  assert.match(directEdit, /capture:\s*true/);
  assert.match(directEdit, /catalogue-direct-edit-mode/);
});

test('clicking a card selects it and exposes in-place text editing plus image controls', () => {
  assert.match(directEdit, /article\.card\[data-key\]/);
  assert.match(directEdit, /contentEditable\s*=\s*enabled\s*\?\s*'true'/);
  assert.match(directEdit, /Image size/);
  assert.match(directEdit, /Image X/);
  assert.match(directEdit, /Image Y/);
  assert.match(directEdit, /Text Y/);
});

// The catalogue's art CSS uses !important transforms, so direct positioning must outrank it.
test('direct image and text positioning overrides existing important transforms', () => {
  assert.match(persistence, /style\.setProperty\('transform',\s*`translate\(\$\{layout\.imageX\}px, \$\{layout\.imageY\}px\) scale\(\$\{layout\.imageScale \/ 100\}\)`,\s*'important'\)/);
  assert.match(persistence, /style\.setProperty\('transform',\s*`translateY\(\$\{layout\.metaY\}px\)`,\s*'important'\)/);
});

test('direct editor uses the existing card selection and catalogue state save path', () => {
  assert.match(directEdit, /catalogue-admin-card/);
  assert.match(persistence, /\/api\/catalogue-overrides/);
  assert.match(persistence, /summaryHtml/);
  assert.match(persistence, /productionHtml/);
  assert.match(persistence, /practicalHtml/);
  assert.match(directEdit, /More fields/);
});

test('direct editor and verified persistence are loaded by the browser module chain', () => {
  assert.match(valueModule, /typeof document !== 'undefined'/);
  assert.match(valueModule, /import\('\.\/catalogue-direct-edit\.mjs'\)/);
  assert.match(valueModule, /import\('\.\/catalogue-direct-persistence\.mjs'\)/);
});

test('direct save verifies layout fields by reading KV back', () => {
  assert.match(persistence, /verifySavedLayout/);
  assert.match(persistence, /await\s+verifySavedLayout\(key, patch\)/);
  assert.match(persistence, /imageScale/);
  assert.match(persistence, /imageX/);
  assert.match(persistence, /imageY/);
  assert.match(persistence, /metaY/);
});

test('saved layout also survives immediate refresh and later DOM card rebuilds', () => {
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

test('mobile Production and Practical blocks are moved farther down', () => {
  assert.match(directEdit, /translateY\(22px\)!important/);
});
