import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Locks the approved desktop spacing/width tweak while preserving mobile behaviour.
const layoutSource = await readFile(new URL('../public/catalogue-card-layout.mjs', import.meta.url), 'utf8');

test('desktop catalogue keeps three columns with an 8px gap and a 42px width extension', () => {
  assert.match(layoutSource, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(layoutSource, /gap:8px!important/);
  assert.match(layoutSource, /width:calc\(100% \+ 42px\)!important/);
  assert.match(layoutSource, /margin-inline:-21px!important/);
});

test('mobile catalogue remains one full-width column', () => {
  assert.match(layoutSource, /@media\(max-width:700px\)[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(layoutSource, /@media\(max-width:700px\)[\s\S]*width:100%!important/);
  assert.match(layoutSource, /@media\(max-width:700px\)[\s\S]*margin-inline:0!important/);
});
