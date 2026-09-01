import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layoutSource = await readFile(new URL('../public/catalogue-card-layout.mjs', import.meta.url), 'utf8');

test('two-card desktop rows use a moderate gap rather than an empty full card column', () => {
  assert.match(layoutSource, /article\.card:last-of-type:nth-of-type\(3n \+ 2\)\{[\s\S]*grid-column:2!important/);
  assert.match(layoutSource, /article\.card:last-of-type:nth-of-type\(3n \+ 2\)\{[\s\S]*transform:translateX\(24px\)!important/);
  assert.doesNotMatch(layoutSource, /article\.card:last-of-type:nth-of-type\(3n \+ 2\)\{[\s\S]*grid-column:3!important/);
});

test('mobile removes the desktop two-card offset', () => {
  assert.match(layoutSource, /@media\(max-width:700px\)[\s\S]*article\.card:last-of-type:nth-of-type\(3n \+ 2\)\{[\s\S]*grid-column:auto!important;[\s\S]*transform:none!important/);
});
