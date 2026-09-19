import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const cardLayout = await readFile(new URL('../public/catalogue-card-layout.mjs', import.meta.url), 'utf8');
const stockClient = await readFile(new URL('../public/catalogue-stock-client.mjs', import.meta.url), 'utf8');

// These are source assertions rather than rendered-layout ones: the rules only take effect
// under a media query, and jsdom does not evaluate those. The rendered behaviour was
// measured in a real browser at 390, 430, 768, 844, 900 and 1024px, both with and without
// the runtime modules loaded.

test('both layout modules stay single column up to the landscape-phone width', () => {
  // 700px left a phone in landscape (roughly 700-930px) on the three-column desktop grid.
  assert.match(cardLayout, /@media\(max-width:900px\)\{/);
  assert.doesNotMatch(cardLayout, /@media\(max-width:700px\)\{/);
  assert.match(stockClient, /@media \(max-width:900px\)\{/);
  assert.doesNotMatch(stockClient, /@media \(max-width:700px\)\{/);
});

test('the page stylesheet forces one column on its own, without any module loading', () => {
  const block = page.match(/@media\(max-width:900px\)\{([\s\S]*?)\}\s*(?:@|\.|<)/)?.[1] || '';
  assert.ok(block, 'the base sheet should carry a 900px block');
  assert.match(block, /html body \.grid\.grid\{[^}]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(block, /html body \.grid\.grid>article\.card\{[^}]*transform:none!important/);
});

test('the base rule outranks the module rule it has to survive without', () => {
  // The module appends its <style> to head at runtime, so it wins any specificity tie on
  // source order. The doubled class is what puts the page rule above `html body .grid`.
  assert.match(cardLayout, /html body \.grid\{/);
  const ownGrid = (page.match(/html body \.grid\.grid\{/g) || []).length;
  assert.ok(ownGrid >= 1, 'the page rule must be more specific than html body .grid');
});

test('the mobile art box is tall enough that portrait artwork is not letterboxed', () => {
  // A 270px box under a full-width card contained portrait artwork down to the short edge,
  // which is what made the picture look small next to the desktop layout.
  const block = page.match(/@media\(max-width:900px\)\{([\s\S]*?)\}\s*(?:@|\.|<)/)?.[1] || '';
  assert.match(block, /html body article\.card \.artframe\{min-height:400px!important\}/);
});
