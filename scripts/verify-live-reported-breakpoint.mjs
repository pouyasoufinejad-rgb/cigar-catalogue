import { chromium } from 'playwright';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const reported = BASE + '/?blend=arturo-fuente-exquisitos-maduro%3Anatural';
const keys = [
  'arturo-fuente-exquisitos-maduro',
  'davidoff-primeros-nicaragua-maduro',
  'foundation-wise-man-corojo-corona',
  'isla-del-sol-maduro-gran-corona',
  'rocky-patel-sun-grown-juniors',
  'undercrown-10-corona-viva'
];

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let crashed = false;
  page.on('crash', () => { crashed = true; });
  const response = await page.goto(reported, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (!response?.ok()) throw new Error('reported URL returned HTTP ' + (response?.status() ?? 'no response'));
  await page.waitForTimeout(6000);
  if (crashed) throw new Error('Chromium renderer crashed on the reported blend deep-link');

  const result = await page.evaluate(async ({ keys }) => {
    const stateResponse = await fetch('/api/catalogue-overrides?verify=1', { cache: 'no-store' });
    if (!stateResponse.ok) throw new Error('state HTTP ' + stateResponse.status);
    const state = await stateResponse.json();
    const cards = {};
    for (const key of keys) {
      const card = document.querySelector('article.card[data-key="' + CSS.escape(key) + '"]');
      const entry = state.entries?.[key] || {};
      const savedCard = state.cards?.[key] || {};
      cards[key] = {
        dom: card ? {
          title: (card.querySelector('h3')?.textContent || '').trim(),
          blend: card.querySelector('[data-blend-select]')?.value || '',
          defaultBlend: card.dataset.defaultBlend || '',
          axes: [...card.querySelectorAll('.flavour-axis[data-axis]')].map(n => [n.dataset.axis, n.dataset.intensity || ''])
        } : null,
        entry: {
          defaultBlendVariantId: entry.defaultBlendVariantId || '',
          flavourProfile: entry.flavourProfile || null,
          blendVariants: Array.isArray(entry.blendVariants) ? entry.blendVariants.map(v => ({
            id: v.id, label: v.label, title: v.title, wrapper: v.wrapper,
            flavourProfile: v.flavourProfile || null,
            productionLines: v.productionLines || null,
            retailerLinks: v.retailerLinks || null,
            packagePrice: v.packagePrice, price: v.price, length: v.length, ring: v.ring
          })) : []
        },
        cardState: {
          defaultBlendVariantId: savedCard.defaultBlendVariantId || '',
          blendVariants: Array.isArray(savedCard.blendVariants) ? savedCard.blendVariants.map(v => ({
            id: v.id, label: v.label, title: v.title,
            flavourProfile: v.flavourProfile || null,
            productionLines: v.productionLines || null,
            retailerLinks: v.retailerLinks || null,
            packagePrice: v.packagePrice, price: v.price, length: v.length, ring: v.ring
          })) : []
        }
      };
    }
    return {
      title: document.title,
      cardCount: document.querySelectorAll('article.card[data-key]').length,
      cards
    };
  }, { keys });

  if (result.cardCount < 80) throw new Error('catalogue rendered only ' + result.cardCount + ' cards');
  const ex = result.cards['arturo-fuente-exquisitos-maduro'];
  if (!ex.dom) throw new Error('Exquisitos card missing from DOM');
  if (ex.dom.blend !== 'natural') throw new Error('deep-link did not select Natural; selected=' + ex.dom.blend);
  const exEntryBlends = ex.entry.blendVariants.map(v => v.id);
  if (exEntryBlends[0] !== 'maduro' || !exEntryBlends.includes('natural')) {
    throw new Error('Exquisitos blend order/data invalid: ' + JSON.stringify(exEntryBlends));
  }

  console.log('REPORTED_URL_CHROMIUM_PASS cards=' + result.cardCount + ' title=' + result.title);
  console.log(JSON.stringify(result.cards, null, 2));
} finally {
  await browser.close();
}
