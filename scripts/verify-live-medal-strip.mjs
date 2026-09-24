#!/usr/bin/env node
// Read-only: checks the laurels really sit in a black strip at the bottom of the image
// frame on the live page, under the smoke time.
//
// jsdom does not resolve the custom property the strip height comes from, so the rendered
// pixels are only measurable in a browser, and the sandbox proxy refuses the Worker host.

import { chromium } from 'playwright';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
let failures = 0;
const fail = message => { console.error(`   FAIL ${message}`); failures += 1; };

const browser = await chromium.launch();
for (const [label, width] of [['desktop', 1440], ['mobile', 412]]) {
  const page = await browser.newPage({
    viewport: { width, height: 1100 }, deviceScaleFactor: 2,
    isMobile: width <= 900, hasTouch: width <= 900
  });
  await page.goto(`${baseUrl}/?strip_check=${Date.now()}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(6000);

  const report = await page.evaluate(() => {
    const out = { cards: 0, outsideFrame: [], overlapArt: [], overlapSmoke: [], darkBacked: 0,
      lightText: 0, sample: null, strayInBody: [] };
    for (const card of document.querySelectorAll('article.card[data-key]')) {
      const frame = card.querySelector('.artframe');
      const medals = card.querySelector('.medals');
      if (!frame || !medals) continue;
      out.cards += 1;
      if (card.querySelector('.cardbody .medals')) out.strayInBody.push(card.dataset.key);
      if (!frame.contains(medals)) { out.outsideFrame.push(card.dataset.key); continue; }

      const f = frame.getBoundingClientRect();
      const m = medals.getBoundingClientRect();
      const img = frame.querySelector('img');
      const smoke = frame.querySelector('.artmeta-bottom');
      if (m.bottom > f.bottom + 1 || m.top < f.top) out.outsideFrame.push(card.dataset.key);
      // The strip is meant to be blank: the artwork should stop above it.
      if (img) {
        const i = img.getBoundingClientRect();
        if (i.height > 0 && i.bottom > m.top + 2) out.overlapArt.push(card.dataset.key);
      }
      if (smoke) {
        const s = smoke.getBoundingClientRect();
        if (s.bottom > m.top + 2) out.overlapSmoke.push(card.dataset.key);
      }
      const bg = getComputedStyle(frame).backgroundColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
      if ((bg[0] + bg[1] + bg[2]) / 3 < 40) out.darkBacked += 1;
      const span = medals.querySelector('.rating>span');
      if (span) {
        const [r, g, b] = getComputedStyle(span).color.match(/\d+/g).map(Number);
        if ((r + g + b) / 3 > 120) out.lightText += 1;
      }
      if (!out.sample) {
        out.sample = {
          key: card.dataset.key,
          frameH: Math.round(f.height),
          stripH: Math.round(m.height),
          artBottomToStrip: img ? Math.round(m.top - img.getBoundingClientRect().bottom) : null,
          smokeToStrip: smoke ? Math.round(m.top - smoke.getBoundingClientRect().bottom) : null,
          stripW: Math.round(m.width), frameW: Math.round(f.width)
        };
      }
    }
    return out;
  });

  console.log(`\n=== ${label} ${width}px : ${report.cards} cards`);
  if (report.sample) console.log(`   sample ${JSON.stringify(report.sample)}`);
  console.log(`   dark-backed frames: ${report.darkBacked}   light rating text: ${report.lightText}`);

  if (!report.cards) fail(`${label}: no cards with both a frame and a laurel row`);
  if (report.outsideFrame.length) fail(`${label}: ${report.outsideFrame.length} laurel rows are not inside the frame (${report.outsideFrame.slice(0, 3).join(', ')})`);
  if (report.strayInBody.length) fail(`${label}: ${report.strayInBody.length} cards still have a laurel row in the body`);
  if (report.overlapArt.length) fail(`${label}: artwork runs into the strip on ${report.overlapArt.length} cards (${report.overlapArt.slice(0, 3).join(', ')})`);
  if (report.overlapSmoke.length) fail(`${label}: the smoke time overlaps the strip on ${report.overlapSmoke.length} cards`);
  if (report.darkBacked !== report.cards) fail(`${label}: only ${report.darkBacked} of ${report.cards} strips are on the frame black`);
  if (report.lightText !== report.cards) fail(`${label}: only ${report.lightText} of ${report.cards} rows use light text on the black strip`);
  if (report.sample && report.sample.stripW < report.sample.frameW - 30) {
    fail(`${label}: the strip is ${report.sample.stripW}px across a ${report.sample.frameW}px frame`);
  }

  await page.screenshot({ path: `strip-${label}.png`, fullPage: false });
  const card = await page.$('article.card .artframe');
  if (card) await card.screenshot({ path: `strip-frame-${label}.png` });
  await page.close();
}
await browser.close();

if (failures) {
  console.error(`\nSTRIP_CHECK_FAILED: ${failures} problem(s) on the live page.`);
  process.exitCode = 1;
} else {
  console.log('\nSTRIP_CHECK_PASSED: laurels sit in a black strip inside the frame, under the smoke time.');
}
