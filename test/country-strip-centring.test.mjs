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

test('the laurel is slightly enlarged at runtime while remaining compact', () => {
  const { badge, glyph } = computeCountryRow(runtimeCss);
  assert.equal(badge.width, '30px', 'runtime: badge width');
  assert.equal(badge.height, '28px', 'runtime: badge height');
  assert.equal(glyph.fontSize, '18px', 'runtime: fallback glyph scales with the badge');
});

test('the enlarged laurel still fits the 30px country strip', () => {
  const { badge } = computeCountryRow(runtimeCss);
  assert.ok(
    Number.parseFloat(badge.height) <= 30,
    'a badge taller than the 30px strip would push the flag and score out of line'
  );
});


test('flag and overall score are slightly enlarged together at runtime', () => {
  const dom = new JSDOM(`<!doctype html><html><head><style>${runtimeCss}</style></head><body>
    <article class="card"><div class="country-above"><div class="country-row">
      <span class="overall-score gold">86</span><span class="country-flag flag-cuba"></span><span class="country-name">Cuba</span>
    </div></div></article>
  </body></html>`);
  const flag = dom.window.getComputedStyle(dom.window.document.querySelector('.country-flag'));
  const score = dom.window.getComputedStyle(dom.window.document.querySelector('.overall-score'));
  assert.match(flag.transform, /1\.1|matrix\(1\.1/);
  assert.match(score.transform, /1\.1|matrix\(1\.1/);
});
