import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const directEdit = await readFile(new URL('../public/catalogue-direct-edit.mjs', import.meta.url), 'utf8').catch(() => '');
const stockClient = await readFile(new URL('../public/catalogue-stock-client.mjs', import.meta.url), 'utf8');

test('Edit catalogue activates direct card edit mode instead of opening the dropdown modal', () => {
  assert.match(directEdit, /catalogue-admin-toggle/);
  assert.match(directEdit, /capture:\s*true/);
  assert.match(directEdit, /catalogue-direct-edit-mode/);
});

test('clicking a card selects it and exposes in-place text editing plus image controls', () => {
  assert.match(directEdit, /article\.card\[data-key\]/);
  assert.match(directEdit, /contentEditable\s*=\s*'true'/);
  assert.match(directEdit, /Image size/);
  assert.match(directEdit, /Image X/);
  assert.match(directEdit, /Image Y/);
});

test('direct editor reuses the existing admin fields and Save button', () => {
  assert.match(directEdit, /catalogue-admin-card/);
  assert.match(directEdit, /catalogue-admin-summary/);
  assert.match(directEdit, /catalogue-admin-production/);
  assert.match(directEdit, /catalogue-admin-practical/);
  assert.match(directEdit, /catalogue-admin-save/);
});

test('mobile Production and Practical blocks are moved farther down', () => {
  assert.match(stockClient, /transform:\s*translateY\(22px\)!important/);
});
