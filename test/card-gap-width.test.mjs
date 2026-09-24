import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Locks the approved desktop spacing/width tweak while preserving mobile behaviour.
const layoutSource = await readFile(new URL('../public/catalogue-card-layout.mjs', import.meta.url), 'utf8');

test('standard desktop catalogue keeps three columns and overhangs to the right only', () => {
  assert.match(layoutSource, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(layoutSource, /gap:8px!important/);
  // The fixed sidebar sits left of the wrap, so a left overhang slides under it.
  assert.match(layoutSource, /--card-room:max\(0px, \(100vw - 100%\) \/ 2 - 16px\)/);
  // The sidebar's right edge sits 40px left of the wrap, so the left overhang stays well
  // under that or it slides beneath the sidebar and covers the cards.
  assert.match(layoutSource, /--card-bleed-left:min\(24px, var\(--card-room\)\)/);
  assert.match(layoutSource, /--card-bleed-right:min\(150px, var\(--card-room\)\)/);
  assert.match(layoutSource, /width:calc\(100% \+ var\(--card-bleed-left\) \+ var\(--card-bleed-right\)\)!important/);
  assert.doesNotMatch(layoutSource, /margin-inline:-\d+px!important/, 'no fixed overhang anywhere');
});

test('desktop header and catalogue chrome use the same horizontal overhang as the cards', () => {
  // The chrome has to bleed exactly as far as the cards, or the header stops short of them.
  assert.match(layoutSource, /@media\(min-width:901px\)[\s\S]*\.wrap > header,[\s\S]*width:calc\(100% \+ var\(--card-bleed-left\) \+ var\(--card-bleed-right\)\)!important/);
  assert.match(layoutSource, /\.wrap > \.section > \.section-head/);
  assert.match(layoutSource, /\.wrap > \.section > \.legend-dropdown/);
  assert.match(layoutSource, /\.wrap > \.section > \.test-impact-note/);
  assert.match(layoutSource, /\.wrap > \.section > \.live-stock-check/);
  assert.match(layoutSource, /\.tier-stack > \.tier-block > \.tier-heading/);
});

test('large desktop catalogue and chrome widen together when the fixed sidebar is present', () => {
  assert.match(layoutSource, /@media\(min-width:1660px\)[\s\S]*html body \.grid,[\s\S]*\.wrap > header,[\s\S]*--card-bleed-right:min\(210px/);
});

test('mobile catalogue remains one full-width column', () => {
  assert.match(layoutSource, /@media\(max-width:900px\)[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(layoutSource, /@media\(max-width:900px\)[\s\S]*width:100%!important/);
  assert.match(layoutSource, /@media\(max-width:900px\)[\s\S]*margin-inline:0!important/);
});
