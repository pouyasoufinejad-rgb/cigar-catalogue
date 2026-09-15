import { readFile, writeFile } from 'node:fs/promises';

const path = 'test/publish-catalogue-request.test.mjs';
let source = await readFile(path, 'utf8');
source = source.replaceAll(
  "jsonResponse({ ...state, cards: writtenState.cards, entries: { 'existing-dynamic': writtenEntry } })",
  "jsonResponse({ ...writtenState, entries: { 'existing-dynamic': writtenEntry } })"
);
source = source.replaceAll(
  "jsonResponse({ ...state, cards: writtenState.cards, entries: { img: writtenEntry } })",
  "jsonResponse({ ...writtenState, entries: { img: writtenEntry } })"
);
source = source.replaceAll(
  'jsonResponse({ ...state, cards: writtenState.cards })',
  'jsonResponse(writtenState)'
);
await writeFile(path, source);
console.log('patched publisher test read-back mocks');
