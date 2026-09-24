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
      lightText: 0, sample: null, strayInBody: [], tierColours: {}, dimScores: [],
      slack: [], worstSlack: 0, labelTints: {}, mismatchedLabels: [] };
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
      // The strip is meant to read as blank frame black. Many cards scale or cover their
      // artwork past the content box, so the test is whether the strip hides it, not
      // whether the image happens to stop short.
      void img;
      const stripBg = getComputedStyle(medals).backgroundColor;
      const alpha = Number(stripBg.match(/rgba?\([^)]*?,\s*([\d.]+)\)$/)?.[1] ?? '1');
      const strip = stripBg.match(/\d+/g)?.map(Number) || [255, 255, 255];
      if (alpha < 1 || (strip[0] + strip[1] + strip[2]) / 3 > 40) out.overlapArt.push(card.dataset.key);
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
      // Every tier should tint its own score, and all of them should clear black.
      for (const tier of ['gold', 'silver', 'bronze']) {
        const score = medals.querySelector(`.rating.${tier} .subscore`);
        if (!score) continue;
        const [r, g, b] = getComputedStyle(score).color.match(/\d+/g).map(Number);
        out.tierColours[tier] = `rgb(${r}, ${g}, ${b})`;
        if ((r + g + b) / 3 < 110) out.dimScores.push(`${card.dataset.key}:${tier}`);
      }
      const frameStyle = getComputedStyle(frame);
      const reserved = Number.parseFloat(frameStyle.paddingBottom) || 0;
      const slack = Math.round(reserved - m.height);
      if (slack > 12) out.slack.push(`${card.dataset.key}:${slack}px`);
      out.worstSlack = Math.max(out.worstSlack, slack);
      // The label should read as the same metal as its own laurel.
      for (const tier of ['gold', 'silver', 'bronze']) {
        const span = medals.querySelector(`.rating.${tier}>span`);
        const score = medals.querySelector(`.rating.${tier} .subscore`);
        if (!span || !score) continue;
        out.labelTints[tier] = getComputedStyle(span).color;
        if (getComputedStyle(span).color !== getComputedStyle(score).color) {
          out.mismatchedLabels.push(`${card.dataset.key}:${tier}`);
        }
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
  console.log(`   score colours by tier: ${JSON.stringify(report.tierColours)}`);
  console.log(`   label colours by tier: ${JSON.stringify(report.labelTints)}`);
  console.log(`   worst empty gap under the laurels: ${report.worstSlack}px`);

  if (!report.cards) fail(`${label}: no cards with both a frame and a laurel row`);
  if (report.outsideFrame.length) fail(`${label}: ${report.outsideFrame.length} laurel rows are not inside the frame (${report.outsideFrame.slice(0, 3).join(', ')})`);
  if (report.strayInBody.length) fail(`${label}: ${report.strayInBody.length} cards still have a laurel row in the body`);
  if (report.overlapArt.length) fail(`${label}: the strip is not opaque frame black on ${report.overlapArt.length} cards (${report.overlapArt.slice(0, 3).join(', ')}), so the artwork shows through`);
  if (report.overlapSmoke.length) fail(`${label}: the smoke time overlaps the strip on ${report.overlapSmoke.length} cards`);
  if (report.darkBacked !== report.cards) fail(`${label}: only ${report.darkBacked} of ${report.cards} strips are on the frame black`);
  if (report.lightText !== report.cards) fail(`${label}: only ${report.lightText} of ${report.cards} rows use light text on the black strip`);
  const tints = new Set(Object.values(report.tierColours));
  if (Object.keys(report.tierColours).length >= 2 && tints.size < Object.keys(report.tierColours).length) {
    fail(`${label}: the tiers do not tint their scores differently (${JSON.stringify(report.tierColours)})`);
  }
  if (report.dimScores.length) fail(`${label}: ${report.dimScores.length} scores are too dark to read on the strip`);
  if (report.slack.length) fail(`${label}: ${report.slack.length} strips leave dead black under the laurels (worst ${report.worstSlack}px: ${report.slack.slice(0, 3).join(', ')})`);
  if (report.mismatchedLabels.length) fail(`${label}: ${report.mismatchedLabels.length} labels do not match their own laurel colour (${report.mismatchedLabels.slice(0, 3).join(', ')})`);
  const labelTints = new Set(Object.values(report.labelTints));
  if (Object.keys(report.labelTints).length >= 2 && labelTints.size < Object.keys(report.labelTints).length) {
    fail(`${label}: the tiers do not tint their labels differently (${JSON.stringify(report.labelTints)})`);
  }
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
