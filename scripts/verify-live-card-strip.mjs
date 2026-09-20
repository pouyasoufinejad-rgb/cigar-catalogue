#!/usr/bin/env node
// Measures the country strip on the live page: where it sits, how big the laurel renders,
// and whether the score still leads the row.
//
// This sandbox's egress proxy refuses the Worker host, so a browser here cannot reach
// production. Running it in Actions is the only way to assert against the page a visitor
// actually gets rather than against a local copy of public/index.html.

import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

// The expected badge size is read from the stylesheet the runtime injects rather than
// pinned here, so deliberately resizing the laurel does not fail this check for the wrong
// reason. What is being asserted is that every card agrees, not any particular number.
const flavourSource = await readFile(new URL('../public/catalogue-flavour.mjs', import.meta.url), 'utf8');
const expectedBadge = (() => {
  const rule = flavourSource.match(/\.laurel-badge\{width:(\d+)px;height:(\d+)px\}/);
  return rule ? `${rule[1]}x${rule[2]}` : null;
})();

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const profiles = [['desktop', 1440], ['tablet', 1000], ['mobile', 412]];
// Optional: report where these cards land in their grid and what sits either side of them.
const neighbourKeys = String(process.env.STRIP_NEIGHBOUR_KEYS || '')
  .split(',').map(value => value.trim()).filter(Boolean);

const browser = await chromium.launch();
let failures = 0;

for (const [label, width] of profiles) {
  const page = await browser.newPage({ viewport: { width, height: 950 }, deviceScaleFactor: 2 });
  await page.goto(`${baseUrl}/?strip_check=${Date.now()}`, { waitUntil: 'load', timeout: 120000 });
  // The flavour module rewrites every country row after load; give it room to settle.
  await page.waitForTimeout(5000);

  const out = await page.evaluate(keys => {
    const cards = [...document.querySelectorAll('article.card')];
    let offCentre = 0;
    let worstOffset = 0;
    let worstKey = '';
    const badgeSizes = new Set();
    let badgeCount = 0;
    let scored = 0;
    let scoreNotFirst = 0;
    const samples = [];

    for (const card of cards) {
      const row = card.querySelector('.country-row');
      if (!row) continue;
      const strip = row.parentElement;
      const r = row.getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      if (r.width < 1 || s.width < 1) continue;
      const offset = Math.abs((r.left + r.width / 2) - (s.left + s.width / 2));
      if (offset > 4) {
        offCentre += 1;
        if (offset > worstOffset) { worstOffset = offset; worstKey = card.dataset.key || card.id || '?'; }
      }
      const badge = row.querySelector('.laurel-badge');
      if (badge) {
        const b = badge.getBoundingClientRect();
        badgeSizes.add(`${Math.round(b.width)}x${Math.round(b.height)}`);
        badgeCount += 1;
      }
      const score = row.querySelector('.overall-score');
      if (score) {
        scored += 1;
        if (row.firstElementChild !== score) scoreNotFirst += 1;
        samples.push(`${card.dataset.key || '?'}=${score.textContent.trim()}`);
      }
    }

    const sampleRow = document.querySelector('.country-row');
    return {
      cards: cards.length,
      offCentre, worstOffset: Math.round(worstOffset), worstKey,
      gridColumn: sampleRow ? getComputedStyle(sampleRow).gridColumn : '(none)',
      badgeCount, badgeSizes: [...badgeSizes],
      gem: document.querySelectorAll('.laurel-badge[data-laurel="gem"]').length,
      crown: document.querySelectorAll('.laurel-badge[data-laurel="crown"]').length,
      visibleAwardBoxes: [...document.querySelectorAll('.gem-award')]
        .filter(node => getComputedStyle(node).display !== 'none').length,
      scored, scoreNotFirst,
      top: samples.sort((a, b) => Number(b.split('=')[1]) - Number(a.split('=')[1])).slice(0, 8),
      // Where a card actually lands once the subsection module has finished moving cards,
      // which is the only thing that settles whether two cards sit next to each other. A
      // static card's data-rank in the served HTML is the stale baked value, so reading
      // the raw response answers a different question.
      neighbours: keys.map(key => {
        const card = document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`);
        if (!card) return `NEIGHBOURS ${key}: (card not found)`;
        const grid = card.closest('.grid');
        const siblings = [...(grid?.querySelectorAll(':scope > article.card:not(.hidden)') || [])];
        const at = siblings.indexOf(card);
        const label = node => `${node.dataset.key || '?'}[${(node.querySelector('.eyebrow')?.textContent || '').trim()}]`;
        return `NEIGHBOURS ${key}: grid=${grid?.id || '?'} pos=${at + 1}/${siblings.length}`
          + ` prev=${at > 0 ? label(siblings[at - 1]) : '(none)'}`
          + ` self=${label(card)}`
          + ` next=${at >= 0 && at + 1 < siblings.length ? label(siblings[at + 1]) : '(none)'}`;
      })
    };
  }, neighbourKeys);

  console.log(`\n=== ${label} ${width}px`);
  console.log(`   cards=${out.cards}  computed grid-column=[${out.gridColumn}]`);
  console.log(`   STRIP_OFF_CENTRE ${out.offCentre}${out.offCentre ? ` (worst ${out.worstOffset}px on ${out.worstKey})` : ''}`);
  console.log(`   EXPECTED_LAUREL ${expectedBadge ?? '(no rule found)'}`);
  console.log(`   LAURELS ${out.badgeCount} (gem ${out.gem}, crown ${out.crown})  sizes=${out.badgeSizes.join(', ') || 'none'}`);
  console.log(`   OLD_AWARD_BOXES_VISIBLE ${out.visibleAwardBoxes}`);
  console.log(`   SCORES ${out.scored} rendered, ${out.scoreNotFirst} not leading the row`);
  console.log(`   TOP ${out.top.join('  ')}`);
  for (const line of out.neighbours) console.log(`   ${line}`);

  if (out.offCentre) { console.error(`   FAIL ${label}: ${out.offCentre} strip(s) not centred`); failures += 1; }
  if (out.visibleAwardBoxes) { console.error(`   FAIL ${label}: the old award box is visible`); failures += 1; }
  if (out.scoreNotFirst) { console.error(`   FAIL ${label}: the score is not first in the row`); failures += 1; }
  if (out.badgeCount && out.badgeSizes.length > 1) {
    console.error(`   FAIL ${label}: laurels render at more than one size`); failures += 1;
  }
  if (out.badgeCount && expectedBadge && out.badgeSizes[0] !== expectedBadge) {
    console.error(`   FAIL ${label}: laurel is ${out.badgeSizes[0]}, the stylesheet says ${expectedBadge}`); failures += 1;
  }

  await page.screenshot({ path: `card-strip-${label}.png`, fullPage: false });
  await page.close();
}

await browser.close();

if (failures) {
  console.error(`\nCARD_STRIP_CHECK_FAILED: ${failures} problem(s) on the live page.`);
  process.exitCode = 1;
} else {
  console.log('\nCARD_STRIP_CHECK_PASSED: strip centred, laurel enlarged, score leading at every width.');
}
