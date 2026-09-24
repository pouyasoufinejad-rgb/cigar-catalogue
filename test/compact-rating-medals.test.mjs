import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

import { renderEntryCard } from '../src/index.js';

const pageHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
// The whole page cascade minus the inlined artwork, so what jsdom computes is what a
// desktop browser computes.
const pageCss = [...pageHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map(match => match[1]).join('\n')
  .replace(/[^{}]*\{[^{}]*base64[^{}]*\}/g, '');

const ENTRY = Object.freeze({
  key: 'medal-layout-fixture',
  brand: 'Liga Privada', title: 'No. 9 Petit Corona Oscuro', eyebrow: 'Fixture',
  country: 'Nicaragua', strength: 6, quality: 8, flavour: 7, risk: 1, rank: 1,
  length: 4.25, ring: 46, packagePrice: 44, packageLabel: 'single cigar', price: 44,
  summaryHtml: '<strong>Fixture.</strong>'
});

function mount() {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>${pageCss}</style></head>`
    + `<body><div class="grid">${renderEntryCard(ENTRY)}</div></body></html>`);
  return dom;
}

function ratingNamed(document, label) {
  return [...document.querySelectorAll('.medals .rating')]
    .find(node => (node.querySelector(':scope > span')?.textContent || '').trim() === label);
}

test('a rating medal has no frame around it', () => {
  const dom = mount();
  const rating = ratingNamed(dom.window.document, 'Strength');
  assert.ok(rating, 'the Strength medal should render');
  const style = dom.window.getComputedStyle(rating);
  assert.equal(Number.parseFloat(style.borderTopWidth) || 0, 0, 'no top border');
  assert.equal(Number.parseFloat(style.borderLeftWidth) || 0, 0, 'no left border');
  assert.equal(style.boxShadow === 'none' || style.boxShadow === '', true, 'no inset frame');
  assert.doesNotMatch(style.background || '', /linear-gradient/, 'no tier fill behind it');
});

test('the tier word is gone, because the medal already says it', () => {
  const dom = mount();
  for (const label of ['Strength', 'Quality', 'Size', 'Value']) {
    const rating = ratingNamed(dom.window.document, label);
    const bold = rating.querySelector('b');
    assert.ok(bold, `${label} still carries the tier in the DOM for the code that reads it`);
    assert.equal(dom.window.getComputedStyle(bold).display, 'none',
      `${label}: the tier word must not be shown`);
  }
});

test('the score sits in the same grid cell as the wreath, not under it', () => {
  const dom = mount();
  const rating = ratingNamed(dom.window.document, 'Strength');
  const medal = rating.querySelector('.medal');
  const subscore = rating.querySelector('.subscore');
  assert.ok(medal && subscore);

  const medalStyle = dom.window.getComputedStyle(medal);
  const subscoreStyle = dom.window.getComputedStyle(subscore);
  // Sharing one cell is what puts the number inside the wreath; separate rows would stack
  // them again and undo the whole change.
  assert.equal(medalStyle.gridArea, subscoreStyle.gridArea,
    'the medal and the score must occupy the same grid cell');
  assert.equal(subscoreStyle.alignSelf, 'center', 'centred down the wreath');
  assert.equal(subscoreStyle.justifySelf, 'center', 'centred across the wreath');
  assert.equal(dom.window.getComputedStyle(rating).display, 'grid');
});

test('the label is pushed down now that there is no frame holding it off the edge', () => {
  const dom = mount();
  const label = ratingNamed(dom.window.document, 'Strength').querySelector(':scope > span');
  assert.ok(Number.parseFloat(dom.window.getComputedStyle(label).paddingTop) > 0,
    'the label needs padding above it');
});

test('the medal block is shorter than the framed version it replaces', () => {
  const dom = mount();
  const rating = ratingNamed(dom.window.document, 'Strength');
  const style = dom.window.getComputedStyle(rating);
  const medalHeight = Number.parseFloat(dom.window.getComputedStyle(rating.querySelector('.medal')).height);
  // The old layout pinned each rating at 158px with a 104px medal inside.
  assert.ok((Number.parseFloat(style.minHeight) || 0) < 158, 'no tall minimum height');
  assert.ok(medalHeight < 104, `the wreath should be smaller, got ${medalHeight}px`);
});

test('every rating still renders a score for the wreath to hold', () => {
  const html = renderEntryCard(ENTRY);
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  for (const label of ['Strength', 'Quality', 'Value']) {
    const rating = ratingNamed(dom.window.document, label);
    assert.match(rating.querySelector('.subscore').textContent, /^\d+\/10$/, `${label} score`);
  }
  // Size has its score filled in by the presentation module at runtime rather than here.
  assert.ok(ratingNamed(dom.window.document, 'Size'));
});

test('an unrated Value shows a dash in the wreath rather than a sentence', () => {
  const html = renderEntryCard({ ...ENTRY, price: 0, packagePrice: 0,
    defaultVariantId: 'toro',
    sizeVariants: [
      { id: 'petit', label: 'Petit', ring: 46, length: 4.25, packagePrice: 44 },
      { id: 'toro', label: 'Toro', ring: 52, length: 6 }
    ] });
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const value = ratingNamed(dom.window.document, 'Value');
  assert.ok(value.classList.contains('value-unrated'));
  assert.equal(value.querySelector('.subscore').textContent, '—');
  assert.doesNotMatch(html, /No AU price/, 'a sentence does not fit inside a wreath');
});
