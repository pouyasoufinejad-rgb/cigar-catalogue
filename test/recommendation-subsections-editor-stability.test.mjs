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

test('stable subsection rendering guards observed card attributes against no-op writes', () => {
  assert.match(source, /if \(card\.dataset\.rank !== rank\) card\.dataset\.rank = rank;/);
  assert.match(source, /if \(card\.dataset\.subsection !== section\.id\) card\.dataset\.subsection = section\.id;/);
});


test('partial catalogue state saves do not inject stale dynamic entries', () => {
  assert.match(source, /const carriesEntries = isRecord\(payload\.entries\)/);
  assert.match(source, /const workingEntries = carriesEntries \? payload\.entries : \(runtimeState\?\.entries \|\| \{\}\)/);
  assert.match(source, /if \(!carriesEntries\) delete next\.entries/);
  assert.match(source, /entries: \{ \.\.\.\(isRecord\(state\.entries\) \? state\.entries : \(runtimeState\?\.entries \|\| \{\}\)\) \}/);
  assert.doesNotMatch(source, /entries: isRecord\(payload\.entries\) \? payload\.entries : \(runtimeState\?\.entries \|\| \{\}\)/);
});
