import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/catalogue-recommendation-subsections.mjs', import.meta.url), 'utf8');

test('recommendation subsection observer is scoped to the catalogue cards instead of the whole editor body', () => {
  assert.doesNotMatch(source, /observer\.observe\(root\.body\s*,/);
  assert.match(source, /getElementById\?\.\(['"]cards['"]\)|querySelector\?\.\(['"]#cards['"]\)/);
});

test('stable subsection rendering does not re-append a card that is already in its grid', () => {
  assert.doesNotMatch(source, /else\s+grid\.appendChild\(card\)/);
});
