import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Locks the approved desktop spacing/width tweak while preserving mobile behaviour.
const layoutSource = await readFile(new URL('../public/catalogue-card-layout.mjs', import.meta.url), 'utf8');

test('standard desktop catalogue keeps three columns with the existing 60px width extension', () => {
  assert.match(layoutSource, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(layoutSource, /gap:8px!important/);
  assert.match(layoutSource, /width:calc\(100% \+ 60px\)!important/);
  assert.match(layoutSource, /margin-inline:-30px!important/);
});

test('desktop header and catalogue chrome use the same horizontal overhang as the cards', () => {
  assert.match(layoutSource, /@media\(min-width:901px\)[\s\S]*\.wrap > header,[\s\S]*width:calc\(100% \+ 60px\)!important;[\s\S]*margin-left:-30px!important/);
  assert.match(layoutSource, /\.wrap > \.section > \.section-head/);
  assert.match(layoutSource, /\.wrap > \.section > \.legend-dropdown/);
  assert.match(layoutSource, /\.wrap > \.section > \.test-impact-note/);
  assert.match(layoutSource, /\.wrap > \.section > \.live-stock-check/);
  assert.match(layoutSource, /\.tier-stack > \.tier-block > \.tier-heading/);
});

test('large desktop catalogue and chrome widen together when the fixed sidebar is present', () => {
  assert.match(layoutSource, /@media\(min-width:1660px\)[\s\S]*html body \.grid,[\s\S]*\.wrap > header,[\s\S]*width:calc\(100% \+ 150px\)!important/);
});

test('mobile catalogue remains one full-width column', () => {
  assert.match(layoutSource, /@media\(max-width:900px\)[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(layoutSource, /@media\(max-width:900px\)[\s\S]*width:100%!important/);
  assert.match(layoutSource, /@media\(max-width:900px\)[\s\S]*margin-inline:0!important/);
});
