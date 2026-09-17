import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/catalogue-control-sidebar.mjs', import.meta.url), 'utf8');

test('brand sidebar never writes catalogue-overrides state', () => {
  const stateApiMentions = source.match(/\/api\/catalogue-overrides/g) || [];
  assert.ok(stateApiMentions.length <= 1, 'sidebar may read catalogue state but must not introduce write helpers for it');
  assert.doesNotMatch(source, /fetch\s*\([^)]*catalogue-overrides[^)]*\)[\s\S]{0,300}method\s*:\s*['"]PUT['"]/i);
  assert.doesNotMatch(source, /method\s*:\s*['"]PUT['"][\s\S]{0,300}catalogue-overrides/i);
});
