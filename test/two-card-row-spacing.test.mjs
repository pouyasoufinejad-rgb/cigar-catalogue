import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layoutSource = await readFile(new URL('../public/catalogue-card-layout.mjs', import.meta.url), 'utf8');

test('two-card desktop rows stay balanced but move inward from the outside columns', () => {
  assert.match(layoutSource, /article\.card:nth-last-of-type\(2\):nth-of-type\(3n \+ 1\)\{[\s\S]*transform:translateX\(30%\)!important/);
  assert.match(layoutSource, /article\.card:last-of-type:nth-of-type\(3n \+ 2\)\{[\s\S]*grid-column:3!important;[\s\S]*transform:translateX\(-30%\)!important/);
});

test('mobile removes both desktop inward offsets', () => {
  assert.match(layoutSource, /@media\(max-width:700px\)[\s\S]*article\.card:nth-last-of-type\(2\):nth-of-type\(3n \+ 1\)\{[\s\S]*transform:none!important/);
  assert.match(layoutSource, /@media\(max-width:700px\)[\s\S]*article\.card:last-of-type:nth-of-type\(3n \+ 2\)\{[\s\S]*grid-column:auto!important;[\s\S]*transform:none!important/);
});
