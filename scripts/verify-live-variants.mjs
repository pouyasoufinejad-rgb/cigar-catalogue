#!/usr/bin/env node
// Renders the live page in a browser and checks the size-variant system end to end.
//
// The sandbox proxy refuses the Worker host, so this is the only way to assert against the
// page a reader actually gets. Read-only: it selects sizes in the page, which never writes.

import { chromium } from 'playwright';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const widths = String(process.env.WIDTHS || '1440,412').split(',').map(Number).filter(Number.isFinite);

const browser = await chromium.launch();
let failures = 0;
const fail = message => { console.error(`   FAIL ${message}`); failures += 1; };

for (const width of widths) {
  const page = await browser.newPage({
    viewport: { width, height: 950 },
    deviceScaleFactor: 2,
    isMobile: width <= 900,
    hasTouch: width <= 900
  });
  await page.goto(`${baseUrl}/?variant_check=${Date.now()}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(6000);

  const report = await page.evaluate(() => {
    const out = { cards: [], selectors: 0, overflow: 0, search: null };
    for (const card of document.querySelectorAll('article.card[data-key]')) {
      const select = card.querySelector('[data-variant-select]');
      if (!select) continue;
      out.selectors += 1;
      const rect = select.getBoundingClientRect();
      const body = card.querySelector('.cardbody').getBoundingClientRect();
      if (rect.right > body.right + 1 || rect.left < body.left - 1) out.overflow += 1;
      out.cards.push({
        key: card.dataset.key,
        sizes: [...select.options].map(option => option.value),
        active: card.dataset.activeVariant || select.value,
        saved: card.dataset.defaultVariant || '',
        title: (card.querySelector('h3')?.textContent || '').trim(),
        perStick: card.querySelectorAll('.facts > div')[1]?.querySelector('b')?.textContent || '',
        unpriced: card.dataset.priceUnverified === '1'
      });
    }
    out.search = Boolean(document.getElementById('catalogue-variant-search-input'));
    out.shortPanatelaCards = [...document.querySelectorAll('article.card:not(.hidden)')]
      .filter(card => /No\. 9 Short Panatela/i.test(card.querySelector('h3')?.textContent || ''))
      .map(card => card.dataset.key);
    return out;
  });

  console.log(`\n=== ${width}px  cards with sizes: ${report.selectors}  search box: ${report.search}`);
  for (const card of report.cards) {
    console.log(`   ${card.key}`);
    console.log(`      sizes=${card.sizes.length} [${card.sizes.join(', ')}]`);
    console.log(`      showing=${card.active} saved-default=${card.saved} title="${card.title}" per-stick=${card.perStick}${card.unpriced ? ' (unpriced)' : ''}`);
    if (card.active !== card.saved) fail(`${card.key} opens on ${card.active} but its saved default is ${card.saved}`);
    if (card.sizes.length < 2) fail(`${card.key} renders a selector with fewer than two sizes`);
  }
  if (!report.selectors) fail('no card rendered a size selector at all');
  if (report.overflow) fail(`${report.overflow} size selector(s) overflow their card`);
  if (!report.search) fail('the search control did not mount');
  console.log(`   ACTIVE_SHORT_PANATELA_CARDS ${JSON.stringify(report.shortPanatelaCards)}`);
  if (report.shortPanatelaCards.length > 1) fail('more than one active card shows the Short Panatela');

  // Selecting a size must rewrite the card and leave the saved default alone.
  const probe = await page.evaluate(async () => {
    const card = document.querySelector('article.card[data-key="liga-privada-no-9-petit-corona-oscuro"]');
    if (!card) return { missing: true };
    const select = card.querySelector('[data-variant-select]');
    const read = () => ({
      title: (card.querySelector('h3')?.textContent || '').trim(),
      perStick: card.querySelectorAll('.facts > div')[1]?.querySelector('b')?.textContent || '',
      size: card.querySelectorAll('.facts > div')[2]?.querySelector('b')?.textContent || '',
      link: card.querySelector('a.shop')?.href || '',
      practical: [...card.querySelectorAll('.artmeta-right .artmeta-line')].map(node => node.textContent),
      valueUnrated: Boolean(card.querySelector('.rating.value-unrated')),
      active: card.dataset.activeVariant,
      saved: card.dataset.defaultVariant
    });
    const before = read();
    select.value = 'petit-corona';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 400));
    const after = read();
    select.value = 'toro';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 400));
    const unpriced = read();
    return { before, after, unpriced, url: window.location.href };
  });

  if (probe.missing) fail('the consolidated No. 9 card is not on the page');
  else {
    console.log('   SELECTION PROBE');
    for (const [label, state] of Object.entries({ before: probe.before, after: probe.after, unpriced: probe.unpriced })) {
      console.log(`      ${label.padEnd(8)} ${state.active} "${state.title}" ${state.perStick} ${state.size} practical=${JSON.stringify(state.practical.slice(-1))}${state.valueUnrated ? ' VALUE-UNRATED' : ''}`);
    }
    if (probe.before.title === probe.after.title) fail('selecting another size did not change the title');
    if (probe.before.perStick === probe.after.perStick) fail('selecting another size did not change the price');
    if (probe.before.link === probe.after.link) fail('selecting another size did not change the retailer link');
    if (probe.after.saved !== probe.before.saved) fail('selecting a size changed the saved default');
    if (!probe.unpriced.valueUnrated) fail('a size with no verified price did not render an unrated Value');
    if (probe.unpriced.perStick !== '—') fail(`an unpriced size shows ${probe.unpriced.perStick} instead of no price`);
    if (!/variant=/.test(probe.url)) fail('a selected size is not addressable by URL');
    console.log(`      url=${probe.url.replace(/^.*\?/, '?')}`);
  }

  await page.screenshot({ path: `variant-${width}.png`, fullPage: false });
  await page.close();
}

await browser.close();
if (failures) {
  console.error(`\nVARIANT_CHECK_FAILED: ${failures} problem(s) on the live page.`);
  process.exitCode = 1;
} else {
  console.log('\nVARIANT_CHECK_PASSED: sizes render, select, price and deep-link on production.');
}
