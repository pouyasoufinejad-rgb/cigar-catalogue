#!/usr/bin/env node
// Measures the live catalogue in a real browser at phone widths.
//
// Everything before this measured a local copy of public/index.html served by a local
// server. That is not the page a phone gets: production carries the Worker's injected
// dynamic entries, and the subsection module then moves cards between grids at runtime.
// This renders the real URL and reports what the browser computes, so a layout claim rests
// on a measurement of production rather than on a local approximation of it.

import { chromium } from 'playwright';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const widths = String(process.env.WIDTHS || '360,412,540,900')
  .split(',').map(value => Number(value.trim())).filter(Number.isFinite);

const browser = await chromium.launch();
let worst = 0;

for (const width of widths) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
  });
  await page.goto(`${baseUrl}/?mobile_layout_check=${Date.now()}`, { waitUntil: 'load', timeout: 120000 });
  // The subsection module moves cards after load; give it room to settle.
  await page.waitForTimeout(4000);

  const report = await page.evaluate(() => {
    const rows = [];
    for (const grid of document.querySelectorAll('.grid')) {
      const cards = [...grid.querySelectorAll(':scope > article.card')]
        .map(card => card.getBoundingClientRect())
        .filter(rect => rect.height > 40 && rect.width > 0);
      if (!cards.length) continue;
      const top = Math.min(...cards.map(rect => rect.top));
      rows.push({
        id: grid.id || grid.className,
        perRow: cards.filter(rect => rect.top - top < 20).length,
        total: cards.length,
        cardWidth: Math.round(cards[0].width),
        gridWidth: Math.round(grid.getBoundingClientRect().width),
        columns: getComputedStyle(grid).gridTemplateColumns
      });
    }
    return {
      innerWidth: window.innerWidth,
      matches900: window.matchMedia('(max-width:900px)').matches,
      docWidth: document.documentElement.scrollWidth,
      rows
    };
  });

  console.log(`\n=== viewport ${width}px  innerWidth=${report.innerWidth}  matches(max-900)=${report.matches900}  docScrollWidth=${report.docWidth}`);
  for (const row of report.rows) {
    const flag = row.perRow > 1 ? '  <-- MORE THAN ONE PER ROW' : '';
    if (row.perRow > 1) worst = Math.max(worst, row.perRow);
    console.log(`   ${String(row.perRow).padStart(2)} per row of ${String(row.total).padEnd(3)} card=${row.cardWidth}px grid=${row.gridWidth}px  [${row.columns}]  ${row.id}${flag}`);
  }

  await page.screenshot({ path: `mobile-layout-${width}.png`, fullPage: false });
  await page.close();
}

await browser.close();

if (worst > 1) {
  console.error(`\nMOBILE_LAYOUT_CHECK_FAILED: a grid rendered ${worst} cards per row at a phone width.`);
  process.exitCode = 1;
} else {
  console.log('\nMOBILE_LAYOUT_CHECK_PASSED: one card per row at every measured phone width.');
}
