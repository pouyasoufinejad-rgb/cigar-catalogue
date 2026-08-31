import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const directEdit = await readFile(new URL('../public/catalogue-direct-edit.mjs', import.meta.url), 'utf8').catch(() => '');
const valueModule = await readFile(new URL('../public/catalogue-value.mjs', import.meta.url), 'utf8');
const unifiedAdmin = await readFile(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');

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
  assert.match(directEdit, /style\.setProperty\('transform',\s*`translate\(\$\{x\}px, \$\{y\}px\) scale\(\$\{scale \/ 100\}\)`,\s*'important'\)/);
  assert.match(directEdit, /style\.setProperty\('transform',\s*`translateY\(\$\{metaY\}px\)`,\s*'important'\)/);
});

test('direct editor uses the existing card selection and catalogue state save path', () => {
  assert.match(directEdit, /catalogue-admin-card/);
  assert.match(directEdit, /\/api\/catalogue-overrides/);
  assert.match(directEdit, /summaryHtml/);
  assert.match(directEdit, /productionHtml/);
  assert.match(directEdit, /practicalHtml/);
  assert.match(directEdit, /More fields/);
});

test('direct editor is loaded by the existing catalogue module chain in browsers only', () => {
  assert.match(valueModule, /typeof document !== 'undefined'/);
  assert.match(valueModule, /import\('\.\/catalogue-direct-edit\.mjs'\)/);
});

// The normal KV hydration pass must restore saved layout itself, not depend on a later direct-editor race.
test('main catalogue hydrator restores saved image and metadata layout', () => {
  assert.match(unifiedAdmin, /function applySavedCardLayout\(card, saved = \{\}\)/);
  assert.match(unifiedAdmin, /saved\.imageScale/);
  assert.match(unifiedAdmin, /saved\.imageX/);
  assert.match(unifiedAdmin, /saved\.imageY/);
  assert.match(unifiedAdmin, /saved\.metaY/);
  assert.match(unifiedAdmin, /applySavedCardLayout\(card, saved\)/);
});

test('mobile Production and Practical blocks are moved farther down', () => {
  assert.match(directEdit, /translateY\(22px\)!important/);
});
