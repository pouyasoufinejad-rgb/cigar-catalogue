import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const valueSource = await readFile(new URL('../public/catalogue-value.mjs', import.meta.url), 'utf8');
const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

test('catalogue runtime bootstrap loads the convenience layer with the other browser presentation modules', () => {
  assert.match(runtimeSource, /import\('\.\/catalogue-convenience\.mjs'\)/);
});

test('Value module stays browser-independent', () => {
  assert.doesNotMatch(valueSource, /import\('\.\/catalogue-[^']+\.mjs'\)/);
  assert.doesNotMatch(valueSource, /\btypeof document\b|\bdocument\./);
});
