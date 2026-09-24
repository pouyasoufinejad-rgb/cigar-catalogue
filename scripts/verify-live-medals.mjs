#!/usr/bin/env node
// Read-only: checks the compact rating medals on the live page.
//
// The score sitting inside the wreath is a layout claim, and the only thing that settles it
// is measuring the rendered boxes. The sandbox proxy refuses the Worker host, so this runs
// in Actions.

import { chromium } from 'playwright';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
let failures = 0;
const fail = message => { console.error(`   FAIL ${message}`); failures += 1; };

const browser = await chromium.launch();
for (const [label, width] of [['desktop', 1440], ['mobile', 412]]) {
  const page = await browser.newPage({
    viewport: { width, height: 1000 }, deviceScaleFactor: 2,
    isMobile: width <= 900, hasTouch: width <= 900
  });
  await page.goto(`${baseUrl}/?medal_check=${Date.now()}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(6000);

  const report = await page.evaluate(() => {
    const out = { cards: 0, ratings: 0, tierWordsShown: 0, framed: 0, offCentre: 0,
      worstOffset: 0, missingScore: [], tallest: 0, sample: [] };
    for (const card of document.querySelectorAll('article.card[data-key]')) {
      const row = card.querySelector('.medals');
      if (!row) continue;
      out.cards += 1;
      for (const rating of row.querySelectorAll('.rating')) {
        out.ratings += 1;
        const style = getComputedStyle(rating);
        const bold = rating.querySelector('b');
        if (bold && style.display !== 'none' && getComputedStyle(bold).display !== 'none') out.tierWordsShown += 1;
        if ((Number.parseFloat(style.borderTopWidth) || 0) > 0) out.framed += 1;
        const height = Math.round(rating.getBoundingClientRect().height);
        if (height > out.tallest) {
          out.tallest = height;
          // Naming the offender matters: guessing at which box is tall is how a layout fix
          // goes wrong several times in a row.
          out.tallestWhere = {
            key: card.dataset.key,
            label: (rating.querySelector(':scope > span')?.textContent || '').trim(),
            classes: rating.className,
            section: card.closest('.archived-section') ? 'archived' : (card.closest('.grid')?.id || '?'),
            compact: document.body.classList.contains('compact-cards')
              || card.classList.contains('compact') || null,
            labelHeight: Math.round(rating.querySelector(':scope > span')?.getBoundingClientRect().height || 0),
            medalHeight: Math.round(rating.querySelector('.medal')?.getBoundingClientRect().height || 0),
            minHeight: getComputedStyle(rating).minHeight,
            padding: getComputedStyle(rating).padding
          };
        }

        const name = (rating.querySelector(':scope > span')?.textContent || '').trim();
        const medal = rating.querySelector('.medal');
        const sub = rating.querySelector('.subscore');
        if (!sub || !sub.textContent.trim()) { out.missingScore.push(name); continue; }
        if (!medal) continue;
        const m = medal.getBoundingClientRect();
        const s = sub.getBoundingClientRect();
        if (!m.width || !s.width) continue;
        const dx = Math.abs((s.left + s.width / 2) - (m.left + m.width / 2));
        const dy = Math.abs((s.top + s.height / 2) - (m.top + m.height / 2));
        const offset = Math.max(dx, dy);
        if (offset > 3) { out.offCentre += 1; out.worstOffset = Math.max(out.worstOffset, Math.round(offset)); }
        const inside = s.top >= m.top && s.bottom <= m.bottom && s.left >= m.left && s.right <= m.right;
        if (!inside) out.offCentre += 1;
        if (out.sample.length < 5) out.sample.push(`${name}=${sub.textContent.trim()}`);
      }
    }
    return out;
  });

  console.log(`\n=== ${label} ${width}px`);
  console.log(`   ${report.cards} cards, ${report.ratings} ratings, tallest rating ${report.tallest}px`);
  if (report.tallestWhere) console.log(`   tallest: ${JSON.stringify(report.tallestWhere)}`);
  console.log(`   sample: ${report.sample.join(' | ')}`);
  console.log(`   tier words still shown: ${report.tierWordsShown}   framed boxes: ${report.framed}   scores off centre: ${report.offCentre}${report.worstOffset ? ` (worst ${report.worstOffset}px)` : ''}`);
  if (report.missingScore.length) console.log(`   ratings with no score: ${[...new Set(report.missingScore)].join(', ')}`);

  if (!report.ratings) fail(`${label}: no rating medals rendered at all`);
  if (report.tierWordsShown) fail(`${label}: ${report.tierWordsShown} medals still print the tier word`);
  if (report.framed) fail(`${label}: ${report.framed} medals still have a box outline`);
  if (report.offCentre) fail(`${label}: ${report.offCentre} scores are not centred inside the wreath`);
  if (report.missingScore.length) fail(`${label}: ${report.missingScore.length} ratings show no score in the wreath`);
  const ceiling = width > 900 ? 130 : 95;
  if (report.tallest > ceiling) fail(`${label}: a rating is ${report.tallest}px, taller than the ${ceiling}px the compact layout should need`);

  await page.screenshot({ path: `medals-${label}.png`, fullPage: false });
  await page.close();
}
await browser.close();

if (failures) {
  console.error(`\nMEDAL_CHECK_FAILED: ${failures} problem(s) on the live page.`);
  process.exitCode = 1;
} else {
  console.log('\nMEDAL_CHECK_PASSED: compact medals, no frames, no tier words, scores inside the wreath.');
}
