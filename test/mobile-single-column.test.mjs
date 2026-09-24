import test from 'node:test';
import assert from 'node:assert/strict';
import { readPageCss } from './helpers/page-css.mjs';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  + '\n<style>' + (await readPageCss()) + '</style>';
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

test('the one-column rule is also delivered by a module, so a stale document cannot strand it', async () => {
  const flavour = await readFile(new URL('../public/catalogue-flavour.mjs', import.meta.url), 'utf8');
  // The page document is the only URL that never changes. A browser holding it in a tab
  // keeps the old stylesheet while still fetching fresh modules, which is exactly how a
  // phone ends up running the current script against a two-column layout.
  assert.match(flavour, /@media\(max-width:900px\)\{[\s\S]*html body \.grid\.grid\.grid\{[^}]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(flavour, /html body article\.card \.artframe\{min-height:400px!important\}/);
  // It has to outrank the page's own copy, which is itself already above the layout module.
  assert.ok(flavour.includes('.grid.grid.grid'), 'the module copy must be the most specific of the three');
});

test('the two-column rule is scoped to wide screens instead of applying everywhere', () => {
  // This carried no media query at all, so it forced two columns at every width and was
  // only ever undone by later rules that happened to match. Anywhere they did not, a
  // phone got two cramped columns with no way for the mobile rules to win.
  const rule = page.match(/[^{}]*\{\s*grid-template-columns:repeat\(2,minmax\(0,560px\)\)!important/);
  assert.ok(rule, 'the wide-screen two-column rule should still exist');
  const before = page.slice(0, page.indexOf(rule[0]));
  assert.match(before.slice(-120), /@media\(min-width:901px\)\{\s*$/,
    'it must sit inside a min-width guard so it cannot reach a phone');
});

test('the base grid has a track floor, so two cramped columns are not representable', () => {
  // Every previous fix relied on a viewport media query evaluating the way the stylesheet
  // assumed. This does not: auto-fit with a minmax floor gives one column whenever the
  // container is narrower than two tracks, whatever the viewport reports. Measured in a
  // real browser with every viewport media query neutered: still one card per row at 320,
  // 360, 412, 540 and 900px.
  assert.match(page, /\.grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,330px\),1fr\)\)/);
  assert.doesNotMatch(page, /\.grid\{display:grid;grid-template-columns:repeat\(2,/);
});
