import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stockClient = await readFile(new URL('../public/catalogue-stock-client.mjs', import.meta.url), 'utf8');

test('card cleanup removes only an exact Unflavoured production line', () => {
  assert.match(stockClient, /textContent\.trim\(\)\.toLowerCase\(\) === 'unflavoured'/);
  assert.match(stockClient, /production[^\n]*querySelectorAll\('\.artmeta-line'\)/);
});

test('card layout gives Production and Practical more room, especially on mobile', () => {
  assert.match(stockClient, /--catalogue-card-max-width:\s*430px/);
  assert.match(stockClient, /--catalogue-artframe-min-height:\s*390px/);
  assert.match(stockClient, /@media \(max-width:\s*700px\)/);
  assert.match(stockClient, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(stockClient, /min-height:\s*var\(--catalogue-artframe-min-height\)/);
});
