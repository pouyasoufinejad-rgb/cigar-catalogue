import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const valueSource = await readFile(new URL('../public/catalogue-value.mjs', import.meta.url), 'utf8');

test('catalogue bootstrap loads the convenience layer with the other browser presentation modules', () => {
  assert.match(valueSource, /import\('\.\/catalogue-convenience\.mjs'\)/);
});
