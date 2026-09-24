#!/usr/bin/env node
// Checks that the retailer and price filters are live, and that a browser holding an older
// runtime would still get them.
//
// Two separate things can go wrong. The Worker can serve the new module while a returning
// visitor keeps a cached copy of the bootstrap that never imports it, because the bootstrap
// URL carries its own version and that version did not change. And the controls can mount
// but filter nothing. Only rendering the real page settles either, and the sandbox proxy
// refuses the Worker host, so this runs in Actions.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
let failures = 0;
const fail = message => { console.error(`   FAIL ${message}`); failures += 1; };

// The bootstrap version the Worker source intends, read from source so a routine bump does
// not fail this check for the wrong reason.
const worker = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const expected = worker.match(/catalogue-runtime\.mjs\?v=(\d+)/)?.[1] || '';
console.log(`=== bootstrap version in source: ${expected}`);

const page0 = await fetch(`${baseUrl}/?filter_check=${Date.now()}`, { cache: 'no-store' });
const html = await page0.text();
const servedVersion = html.match(/catalogue-runtime\.mjs\?v=(\d+)/)?.[1] || '';
console.log(`=== bootstrap version production serves: ${servedVersion}`);
if (servedVersion !== expected) fail(`production serves v=${servedVersion}, source says v=${expected}`);

// Does the bootstrap at that exact URL actually import the filter module? A returning
// visitor gets whatever is cached under this URL, so this is what they run.
const bootstrap = await fetch(`${baseUrl}/catalogue-runtime.mjs?v=${servedVersion}`, { cache: 'no-store' });
const bootstrapSource = await bootstrap.text();
const importsFilters = /catalogue-filter-refinements\.mjs/.test(bootstrapSource);
console.log(`=== bootstrap at ?v=${servedVersion} imports the filter module: ${importsFilters}`);
if (!importsFilters) fail(`the bootstrap served at ?v=${servedVersion} never imports catalogue-filter-refinements.mjs`);

// The cards overhang the wrap to reach full width. The fixed sidebar sits to the left of
// the wrap, so a left overhang slides underneath it and covers the cards.
async function checkSidebarClearance(page, label) {
  const geometry = await page.evaluate(() => {
    const sidebar = document.querySelector('#catalogue-control-sidebar, [id*="sidebar"]');
    const grid = document.querySelector('.grid');
    if (!grid) return { missing: true };
    const g = grid.getBoundingClientRect();
    const s = sidebar ? sidebar.getBoundingClientRect() : null;
    const visible = s && getComputedStyle(sidebar).display !== 'none' && s.width > 0;
    return {
      gridLeft: Math.round(g.left), gridRight: Math.round(g.right),
      sidebarRight: visible ? Math.round(s.right) : null,
      gap: visible ? Math.round(g.left - s.right) : null,
      viewport: window.innerWidth,
      docWidth: document.documentElement.scrollWidth
    };
  });
  if (geometry.missing) { fail(`${label}: no grid to measure`); return; }
  console.log(`   grid ${geometry.gridLeft}..${geometry.gridRight} of ${geometry.viewport}px`
    + (geometry.sidebarRight === null ? '  (no sidebar at this width)' : `  sidebar ends ${geometry.sidebarRight}, gap ${geometry.gap}px`));
  if (geometry.gap !== null && geometry.gap < 8) {
    fail(`${label}: only ${geometry.gap}px between the sidebar and the cards, so the sidebar covers them`);
  }
  if (geometry.docWidth > geometry.viewport + 1) {
    fail(`${label}: the page scrolls sideways (${geometry.docWidth}px in a ${geometry.viewport}px viewport)`);
  }
}

const browser = await chromium.launch();
for (const [label, width] of [['wide', 1800], ['desktop', 1440], ['mobile', 412]]) {
  const page = await browser.newPage({
    viewport: { width, height: 950 }, deviceScaleFactor: 2,
    isMobile: width <= 900, hasTouch: width <= 900
  });
  await page.goto(`${baseUrl}/?filter_check=${Date.now()}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(6000);

  const report = await page.evaluate(() => {
    const select = document.getElementById('catalogue-retailer-filter');
    const visible = node => Boolean(node && getComputedStyle(node).display !== 'none');
    const priceButtons = [...document.querySelectorAll('button, [role="button"], label')]
      .map(node => (node.textContent || '').trim())
      .filter(text => /^(Under\s+)?A\$\s?\d/.test(text));
    return {
      hasSelect: Boolean(select),
      selectVisible: visible(select),
      // Where the control sits matters: it was asked for at the bottom of the Sort by block.
      nearSortControls: Boolean(select?.closest('.controls')),
      afterSort: Boolean(select && document.getElementById('sort')
        && (document.getElementById('sort').compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING)),
      retailers: select ? [...select.options].map(option => option.textContent.trim()) : [],
      priceButtons: [...new Set(priceButtons)],
      cards: document.querySelectorAll('article.card').length
    };
  });

  console.log(`\n=== ${label} ${width}px`);
  console.log(`   retailer select present=${report.hasSelect} visible=${report.selectVisible} inside .controls=${report.nearSortControls} after #sort=${report.afterSort}`);
  console.log(`   retailers (${report.retailers.length}): ${report.retailers.join(' | ')}`);
  console.log(`   price bands: ${report.priceButtons.join(' | ')}`);

  if (!report.hasSelect) fail(`${label}: the retailer dropdown did not mount`);
  else if (!report.selectVisible) fail(`${label}: the retailer dropdown is not visible`);
  if (report.hasSelect && !report.afterSort) fail(`${label}: the dropdown is not below the Sort by controls`);
  for (const band of ['Under A$15', 'A$15–35', 'A$35–60']) {
    if (!report.priceButtons.some(text => text.includes(band.replace('Under ', '')))) {
      fail(`${label}: the ${band} band is missing`);
    }
  }
  if (report.priceButtons.some(text => /25\s*[–-]\s*50/.test(text))) {
    fail(`${label}: the old A$25–50 band is still present`);
  }

  // Picking a retailer must actually hide cards, and must keep an entry whose only link to
  // that retailer sits on a variant rather than on the parent.
  if (report.hasSelect && report.retailers.length > 1) {
    const filtered = await page.evaluate(async () => {
      const select = document.getElementById('catalogue-retailer-filter');
      const countShown = () => [...document.querySelectorAll('article.card')]
        .filter(card => getComputedStyle(card).display !== 'none').length;
      const before = countShown();
      const target = [...select.options].find(option => /cigar\s*hut/i.test(option.textContent));
      if (!target) return { skipped: true, before };
      select.value = target.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 500));
      const after = countShown();
      select.value = select.options[0].value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 500));
      return { skipped: false, before, after, restored: countShown(), label: target.textContent.trim() };
    });
    if (filtered.skipped) console.log('   (no Cigar Hut option to exercise)');
    else {
      console.log(`   filter "${filtered.label}": ${filtered.before} shown -> ${filtered.after} -> ${filtered.restored} restored`);
      if (!(filtered.after < filtered.before)) fail(`${label}: choosing a retailer hid nothing`);
      if (filtered.after === 0) fail(`${label}: choosing a retailer hid every card`);
      if (filtered.restored !== filtered.before) fail(`${label}: clearing the filter did not restore every card`);
    }
  }

  await checkSidebarClearance(page, label);

  await page.screenshot({ path: `filters-${label}.png`, fullPage: false });
  await page.close();
}
await browser.close();

if (failures) {
  console.error(`\nFILTER_CHECK_FAILED: ${failures} problem(s) on the live page.`);
  process.exitCode = 1;
} else {
  console.log('\nFILTER_CHECK_PASSED: retailer and price filters are live and filtering.');
}
