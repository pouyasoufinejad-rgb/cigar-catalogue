import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

const pageHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const moduleSource = await readFile(new URL('../public/catalogue-flavour.mjs', import.meta.url), 'utf8');

// The whole page cascade, minus the inlined flag artwork, which is megabytes of base64 and
// has no bearing on placement. Order is preserved, so what jsdom computes here is what a
// desktop browser computes: at the default 1024px window none of the phone media queries
// match.
const pageCss = [...pageHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map(match => match[1])
  .join('\n')
  .replace(/[^{}]*\{[^{}]*base64[^{}]*\}/g, '');

// The same rules the runtime re-injects, which is what a browser holding a stale document
// actually ends up with.
const runtimeCss = moduleSource.match(/style\.textContent = `([\s\S]*?)`;/)[1];

function computeCountryRow(css) {
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body>
    <article class="card"><div class="cardbody">
      <div class="country-above"><div class="country-row">
        <span class="overall-score gold">86</span>
        <span class="country-flag flag-cuba"></span>
        <span class="country-name">Cuba</span>
        <span class="laurel-badge laurel-crown"><i>&#9819;</i></span>
      </div></div>
    </div></article>
  </body></html>`);
  const document = dom.window.document;
  return {
    row: dom.window.getComputedStyle(document.querySelector('.country-row')),
    badge: dom.window.getComputedStyle(document.querySelector('.laurel-badge')),
    glyph: dom.window.getComputedStyle(document.querySelector('.laurel-badge i'))
  };
}

test('the desktop country strip is centred across the card, not pinned to the right third', () => {
  const { row } = computeCountryRow(pageCss);
  assert.notEqual(
    row.gridColumn.trim(),
    '3',
    'column 3 of a three-column strip is the old right-hand placement'
  );
  assert.equal(row.gridColumn.trim(), '1/-1', 'the row spans the whole strip');
  assert.equal(row.justifyContent, 'center', 'and its contents sit in the middle of it');
});

test('a stale document still gets the centred strip from the runtime stylesheet', () => {
  // A browser keeping the old page CSS in a tab would otherwise hold the right-hand
  // placement while happily fetching the new modules.
  const { row } = computeCountryRow(runtimeCss);
  assert.equal(row.gridColumn.trim(), '1/-1');
});

test('the laurel is larger than the 22x20 badge it replaces, in the page and at runtime', () => {
  for (const [label, css] of [['page', pageCss], ['runtime', runtimeCss]]) {
    const { badge, glyph } = computeCountryRow(css);
    assert.equal(badge.width, '27px', `${label}: badge width`);
    assert.equal(badge.height, '25px', `${label}: badge height`);
    assert.equal(glyph.fontSize, '16px', `${label}: fallback glyph scales with the badge`);
  }
});

test('the enlarged laurel still fits the 30px country strip', () => {
  const { row, badge } = computeCountryRow(pageCss);
  assert.equal(row.height, '30px');
  assert.ok(
    Number.parseFloat(badge.height) <= Number.parseFloat(row.height),
    'a badge taller than the strip would push the flag and score out of line'
  );
});
