import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

globalThis.__CATALOGUE_MEDAL_STRIP_TEST__ = true;
const strip = await import('../public/catalogue-medal-strip.mjs');
import { renderEntryCard } from '../src/index.js';

const pageHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const pageCss = [...pageHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map(match => match[1]).join('\n')
  .replace(/[^{}]*\{[^{}]*base64[^{}]*\}/g, '');

const ENTRY = Object.freeze({
  key: 'strip-fixture', brand: 'Liga Privada', title: 'No. 9', eyebrow: 'Fixture',
  country: 'Nicaragua', strength: 8, quality: 9, risk: 1, rank: 1,
  length: 4.25, ring: 46, packagePrice: 44, packageLabel: 'single cigar', price: 44,
  smokeTime: '20–30 min smoke', summaryHtml: '<strong>Fixture.</strong>'
});

// A static card ships with the row down in the body, which is what the module has to fix.
const STATIC_CARD = `<article class="card" data-key="static-one">
  <div class="artframe"><img src="x.webp" alt="">
    <div class="artmeta artmeta-bottom">About 20 min smoke</div>
  </div>
  <div class="cardbody">
    <h3>Static</h3>
    <div class="medals"><div class="rating gold"><span>Strength</span><i class="medal gold"></i><b>Gold</b><small class="subscore">8/10</small></div></div>
    <p class="summary">x</p>
  </div>
</article>`;

function mount(body) {
  const dom = new JSDOM(`<!doctype html><html><head><style>${pageCss}</style></head><body>${body}</body></html>`);
  strip.ensureStripStyle(dom.window.document);
  return dom;
}

test('the Worker renders the laurels inside the frame, after the smoke time', () => {
  const html = renderEntryCard(ENTRY);
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const card = dom.window.document.querySelector('article.card');
  const frame = card.querySelector('.artframe');
  const medals = card.querySelector('.medals');
  assert.ok(frame.contains(medals), 'the row belongs in the image frame');
  assert.equal(frame.lastElementChild, medals, 'and last, under the smoke time');
  const smoke = frame.querySelector('.artmeta-bottom');
  assert.ok(smoke && (smoke.compareDocumentPosition(medals) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING),
    'the smoke time comes first');
  assert.equal(card.querySelector('.cardbody .medals'), null, 'and not in the body as well');
});

test('a static card has its laurels moved into the frame', () => {
  const dom = mount(STATIC_CARD);
  const card = dom.window.document.querySelector('article.card');
  assert.ok(strip.medalsBelongInFrame(card), 'the fixture starts with them in the body');
  assert.equal(strip.moveAllMedalsIntoFrames(dom.window.document), 1);
  const frame = card.querySelector('.artframe');
  assert.ok(frame.contains(card.querySelector('.medals')));
  assert.equal(frame.lastElementChild.className, 'medals');
  assert.equal(card.querySelector('.cardbody .medals'), null);
});

test('moving is idempotent, so a re-render does not shuffle the row around', () => {
  const dom = mount(STATIC_CARD);
  assert.equal(strip.moveAllMedalsIntoFrames(dom.window.document), 1);
  assert.equal(strip.moveAllMedalsIntoFrames(dom.window.document), 0, 'nothing left to move');
  assert.equal(strip.moveAllMedalsIntoFrames(dom.window.document), 0);
  assert.equal(dom.window.document.querySelectorAll('.medals').length, 1, 'never duplicated');
});

test('the frame gains a black strip below the artwork rather than shrinking it', () => {
  const dom = mount(renderEntryCard(ENTRY));
  const frame = dom.window.document.querySelector('.artframe');
  const style = dom.window.getComputedStyle(frame);
  // content-box is what keeps every declared .artframe height meaning the artwork area.
  assert.equal(style.boxSizing, 'content-box');
  // jsdom does not resolve custom properties, so this checks the wiring and the declared
  // size; the rendered height is measured against production by verify-live-medal-strip.
  assert.match(style.paddingBottom, /var\(--medal-strip\)/,
    `the strip height should come from the variable, got ${style.paddingBottom}`);
  const source = strip.ensureStripStyle.toString();
  void source;
  const sheet = dom.window.document.getElementById(strip.STRIP_STYLE_ID).textContent;
  const desktop = Number.parseFloat(sheet.match(/:root\{--medal-strip:(\d+(?:\.\d+)?)px/)[1]);
  const phone = Number.parseFloat(sheet.match(/max-width:900px\)\{\s*:root\{--medal-strip:(\d+(?:\.\d+)?)px/)[1]);
  assert.ok(desktop > 100, `the desktop strip should clear the laurels, got ${desktop}px`);
  assert.ok(phone > 70 && phone < desktop, `the phone strip should be smaller but usable, got ${phone}px`);
});

test('the laurels sit in the strip and the smoke time stays above it', () => {
  const dom = mount(renderEntryCard(ENTRY));
  const document = dom.window.document;
  const medals = dom.window.getComputedStyle(document.querySelector('.artframe .medals'));
  assert.equal(medals.position, 'absolute');
  assert.equal(medals.bottom, '0px');
  assert.ok(Number.parseInt(medals.zIndex, 10) >= 4, 'above the darkening gradient');
  const smoke = dom.window.getComputedStyle(document.querySelector('.artmeta-bottom'));
  assert.notEqual(smoke.bottom, '12px', 'it must not still sit at the old offset');
  assert.notEqual(smoke.bottom, '10px');
});

test('the strip is opaque frame black, so scaled artwork cannot show through', () => {
  const dom = mount(renderEntryCard(ENTRY));
  const style = dom.window.getComputedStyle(dom.window.document.querySelector('.artframe .medals'));
  // Many cards scale or cover their image past the content box with their own !important
  // rules, so the strip has to paint over whatever lands behind it.
  assert.match(style.backgroundColor, /rgb\(2, 2, 2\)/,
    `the strip should be the frame black, got ${style.backgroundColor}`);
  assert.doesNotMatch(style.backgroundColor, /rgba/, 'and fully opaque');
});

test('each tier tints its own score, still readable on black', () => {
  const sheet = (() => {
    const dom = mount(renderEntryCard(ENTRY));
    return dom.window.document.getElementById(strip.STRIP_STYLE_ID).textContent;
  })();
  const tints = {};
  for (const tier of ['gold', 'silver', 'bronze']) {
    const hit = sheet.match(new RegExp(`\\.rating\\.${tier} \\.subscore\\{color:(#[0-9a-f]{6})`, 'i'));
    assert.ok(hit, `${tier} should tint its score`);
    tints[tier] = hit[1];
    const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hit[1].slice(i, i + 2), 16));
    assert.ok((r + g + b) / 3 > 110, `${tier} at ${hit[1]} is too dark for a black strip`);
  }
  assert.equal(new Set(Object.values(tints)).size, 3, 'the three metals must differ');
});

test('the gradient is not cut short, which drew a seam across the frame', () => {
  const dom = mount(renderEntryCard(ENTRY));
  const sheet = dom.window.document.getElementById(strip.STRIP_STYLE_ID).textContent;
  assert.doesNotMatch(sheet, /\.artframe:after\{bottom:var\(--medal-strip\)/,
    'stopping the gradient above the strip leaves a visible edge');
});

test('rating text is legible on black rather than the cream-card brown', () => {
  const dom = mount(renderEntryCard(ENTRY));
  const label = dom.window.getComputedStyle(
    dom.window.document.querySelector('.artframe .medals .rating>span'));
  const score = dom.window.getComputedStyle(
    dom.window.document.querySelector('.artframe .medals .subscore'));
  assert.notEqual(label.color, 'rgb(115, 92, 67)', 'the cream-card brown does not read on black');
  const [r, g, b] = label.color.match(/\d+/g).map(Number);
  assert.ok((r + g + b) / 3 > 120, `the label should be light on black, got ${label.color}`);
  void score;
});

test('the runtime loads the strip module', async () => {
  const loader = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
  assert.match(loader, /import\('\.\/catalogue-medal-strip\.mjs\?v=[a-z0-9-]+'\)/);
});

test('the strip sizes itself to the laurels instead of a fixed guess', () => {
  const dom = mount(renderEntryCard(ENTRY));
  const medals = dom.window.document.querySelector('.artframe .medals');
  // A fixed height left dead black under the row whenever it came out shorter than the
  // number, and every change to the medal size or card width moved that target again.
  assert.equal(dom.window.getComputedStyle(medals).height, 'auto');

  const card = dom.window.document.querySelector('article.card');
  const frame = card.querySelector('.artframe');
  // jsdom reports no layout, so drive the sync with stubbed measurements. The frame's own
  // height is read first, to tell "not laid out yet" from "genuinely has no laurels".
  frame.getBoundingClientRect = () => ({ height: 400, width: 400, top: 0, bottom: 400, left: 0, right: 400 });
  medals.getBoundingClientRect = () => ({ height: 97, width: 400, top: 0, bottom: 97, left: 0, right: 400 });
  assert.equal(strip.syncStripHeight(card), 97);
  assert.equal(frame.style.getPropertyValue('--medal-strip'), '97px',
    'the frame reserves exactly what the row measured');

  // A card that is not laid out yet measures nothing, and that measurement means nothing.
  frame.getBoundingClientRect = () => ({ height: 0, width: 0, top: 0, bottom: 0, left: 0, right: 0 });
  assert.equal(strip.syncStripHeight(card), 0);
  assert.equal(frame.style.getPropertyValue('--medal-strip'), '97px', 'the last good height stands');
});

test('a card with no laurels reserves no strip at all', () => {
  const dom = mount(renderEntryCard(ENTRY));
  const card = dom.window.document.querySelector('article.card');
  const frame = card.querySelector('.artframe');
  const medals = frame.querySelector('.medals');
  frame.getBoundingClientRect = () => ({ height: 400, width: 400, top: 0, bottom: 400, left: 0, right: 400 });
  medals.getBoundingClientRect = () => ({ height: 86, width: 400, top: 0, bottom: 86, left: 0, right: 400 });

  medals.innerHTML = '';
  assert.equal(strip.syncStripHeight(card), 0);
  // Reserving for an empty row leaves a blank black band under the artwork with nothing
  // in it, which is exactly the gap this was meant to remove.
  assert.equal(frame.style.getPropertyValue('--medal-strip'), '0px');
});

test('each label takes the colour of its own laurel', () => {
  const dom = mount(renderEntryCard(ENTRY));
  const sheet = dom.window.document.getElementById(strip.STRIP_STYLE_ID).textContent;
  const tints = {};
  for (const tier of ['gold', 'silver', 'bronze']) {
    const hit = sheet.match(new RegExp(`\\.rating\\.${tier}>span\\{color:(#[0-9a-f]{6})`, 'i'));
    assert.ok(hit, `${tier} should tint its label`);
    tints[tier] = hit[1];
  }
  assert.equal(new Set(Object.values(tints)).size, 3, 'the three metals must differ');
  // And the label matches the score of the same tier, so a row reads as one metal.
  for (const tier of ['gold', 'silver', 'bronze']) {
    const score = sheet.match(new RegExp(`\\.rating\\.${tier} \\.subscore\\{color:(#[0-9a-f]{6})`, 'i'))[1];
    assert.equal(tints[tier], score, `${tier}: label and score should be the same metal`);
  }
});
