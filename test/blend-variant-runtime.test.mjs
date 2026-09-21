import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import { renderEntryCard } from '../src/index.js';
import {
  blendEffectiveRecord,
  defaultBlendVariantId,
  normaliseBlendVariants,
  resolveSearchQuery
} from '../public/catalogue-variants.mjs';

globalThis.__CATALOGUE_VARIANT_TEST__ = true;

const ROCKY = Object.freeze({
  key: 'rocky-patel-sun-grown-juniors',
  brand: 'Rocky Patel',
  title: 'Sun Grown Juniors',
  eyebrow: 'Compact Ecuadorian Sumatra Sun Grown',
  country: 'Honduras',
  strength: 9,
  quality: 8,
  flavour: 8,
  risk: 1,
  rank: 4,
  length: 4,
  ring: 38,
  packagePrice: 85,
  packageLabel: 'pack of 5',
  price: 17,
  stock: 'in',
  productionLines: [
    'Handmade',
    'Wrapper: Ecuadorian Sumatra Sun Grown',
    'Binder: Nicaraguan',
    'Filler: Nicaraguan'
  ],
  practicalLines: ['pack of 5', 'Uncut', 'Protected', 'Lenient Cadence'],
  smokeTime: '25–35 min smoke',
  summaryHtml: '<strong>Pepper, cedar and roasted nuts.</strong>',
  noteHtml: 'Tasted. Very strong pepper.',
  retailerLinks: ['https://www.cigarhut.com.au/rocky-patel-sun-grown-juniors-pack-of-5/'],
  sizeVariants: [
    {
      id: 'juniors', label: 'Juniors', title: 'Sun Grown Juniors',
      length: 4, ring: 38, packagePrice: 85, packageCount: 5, packageLabel: 'pack of 5',
      retailerLinks: ['https://www.cigarhut.com.au/rocky-patel-sun-grown-juniors-pack-of-5/'],
      practicalLines: ['pack of 5', 'Uncut', 'Protected', 'Lenient Cadence'],
      smokeTime: '25–35 min smoke'
    },
    {
      id: 'robusto', label: 'Robusto', title: 'Sun Grown Robusto',
      length: 5.5, ring: 50, packagePrice: 47.3, packageLabel: 'single cigar',
      retailerLinks: ['https://www.theindexcigars.com.au/products/rocky-patel-sungrown-robusto'],
      practicalLines: ['single cigar', 'Uncut', 'Protected', 'Forgiving Cadence'],
      smokeTime: 'About 50–65 min smoke'
    }
  ],
  defaultVariantId: 'juniors',
  blendVariants: [
    { id: 'sun-grown', label: 'Sun Grown' },
    {
      id: 'maduro',
      label: 'Maduro',
      title: 'Sun Grown Maduro Robusto',
      eyebrow: 'Broadleaf Maduro counterpart to Sun Grown',
      packagePrice: 47.3,
      packageLabel: 'single cigar',
      price: 47.3,
      country: 'Nicaragua',
      length: 5,
      ring: 50,
      strength: 8,
      quality: 9,
      flavour: null,
      risk: 1,
      stock: 'in',
      summaryHtml: '<strong>Dark coffee, cocoa, caramel and pepper.</strong>',
      noteHtml: 'Untasted.',
      productionLines: [
        'Handmade in Estelí, Nicaragua',
        'Wrapper: Broadleaf Maduro',
        'Binder: Nicaraguan',
        'Filler: Nicaraguan'
      ],
      practicalLines: ['Single cigar', 'Uncut', 'Protected', 'Forgiving Cadence'],
      smokeTime: 'About 60 min smoke',
      retailerLinks: ['https://www.theindexcigars.com.au/products/sun-grown-maduro-robusto'],
      priceChecked: '2026-09-21',
      stockChecked: '2026-09-21'
    }
  ],
  defaultBlendVariantId: 'sun-grown'
});

function mount({ admin = false, url = 'https://example.test/' } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      ${admin ? '<div id="catalogue-admin-panel"></div>' : ''}
      <div class="controls"></div>
      <div class="grid">${renderEntryCard(ROCKY)}</div>
    </body></html>`,
    { url }
  );
  for (const name of ['window', 'document', 'MutationObserver', 'Node', 'Element', 'HTMLElement', 'CSS']) {
    globalThis[name] = name === 'window' ? dom.window : dom.window[name];
  }
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  return dom;
}

function state() {
  return {
    cards: { [ROCKY.key]: structuredClone(ROCKY) },
    entries: { [ROCKY.key]: structuredClone(ROCKY) }
  };
}

async function runtime() {
  return import('../public/catalogue-variant-runtime.mjs');
}

function cardOf(dom) {
  return dom.window.document.querySelector(`article.card[data-key="${ROCKY.key}"]`);
}

function ratingScore(card, label) {
  const rating = [...card.querySelectorAll('.rating')]
    .find(node => node.querySelector(':scope > span')?.textContent === label);
  return rating?.querySelector('.subscore')?.textContent || '';
}

test('blend normalisation keeps Blend separate from Size and does not inherit base sizes', () => {
  const blends = normaliseBlendVariants(ROCKY);
  assert.deepEqual(blends.map(item => item.id), ['sun-grown', 'maduro']);
  assert.equal(defaultBlendVariantId(ROCKY), 'sun-grown');

  const maduro = blendEffectiveRecord(ROCKY, 'maduro').record;
  assert.equal(maduro.title, 'Sun Grown Maduro Robusto');
  assert.deepEqual(maduro.sizeVariants, [], 'Maduro must not inherit Sun Grown sizes');
  assert.equal(maduro.productionLines[1], 'Wrapper: Broadleaf Maduro');

  const promoted = { ...ROCKY, defaultBlendVariantId: 'maduro' };
  const sunGrown = blendEffectiveRecord(promoted, 'sun-grown').record;
  assert.equal(sunGrown.title, ROCKY.title, 'the base blend still resolves from the parent after promotion');
  assert.equal(sunGrown.sizeVariants.length, 2);
});


test('Chiselito Natural repair stays distinct from the Maduro parent', async () => {
  const repair = JSON.parse(await readFile(
    new URL('../catalogue-requests/2026-09-21-45-fix-chiselito-natural-image.json', import.meta.url),
    'utf8'
  ));
  const maduro = {
    key: repair.key,
    brand: 'La Flor Dominicana',
    title: 'Double Ligero Chiselito Maduro',
    eyebrow: 'Double-ligero Maduro chisel',
    packagePrice: 36.2,
    packageLabel: 'single cigar',
    price: 36.2,
    country: 'Dominican Republic',
    length: 5,
    ring: 44,
    strength: 9,
    quality: 9,
    risk: 2,
    stock: 'in',
    summaryHtml: '<strong>Dark chocolate, espresso, leather, raisin, red pepper and sweet spice</strong> define the Maduro.',
    productionLines: [
      'Handmade in the Dominican Republic',
      'Wrapper: Ecuadorian Maduro',
      'Binder: Dominican Republic',
      'Filler: Dominican Republic, ligero-heavy'
    ],
    practicalLines: ['Single cigar', 'Chisel cap', 'Protected', 'Forgiving Cadence'],
    retailerLinks: ['https://www.theindexcigars.com.au/products/la-flor-dominicana-double-ligero-chiselito-maduro'],
    blendVariants: repair.entry.blendVariants,
    defaultBlendVariantId: repair.entry.defaultBlendVariantId
  };

  const natural = blendEffectiveRecord(maduro, 'natural').record;
  assert.equal(natural.title, 'Double Ligero Chiselito Natural');
  assert.match(natural.productionLines.join('\n'), /Ecuadorian Sumatra Sun Grown/);
  assert.notEqual(natural.summaryHtml, maduro.summaryHtml);
  assert.match(natural.retailerLinks[0], /theindexcigars\.com\.au\/products\/la-flor-dominicana-double-ligero-chiselito-natural/);
  assert.equal(natural.activeBlendVariantId, 'natural');
});

test('Exquisitos Natural carries its own image instead of inheriting Maduro', async () => {
  const repair = JSON.parse(await readFile(
    new URL('../catalogue-requests/2026-09-21-44-fix-exquisitos-natural-image.json', import.meta.url),
    'utf8'
  ));
  const parent = {
    key: repair.key,
    title: 'Exquisitos Maduro',
    imageUrl: '/api/catalogue-image/arturo-fuente-exquisitos-maduro',
    blendVariants: repair.entry.blendVariants,
    defaultBlendVariantId: repair.entry.defaultBlendVariantId
  };
  const natural = blendEffectiveRecord(parent, 'natural').record;
  assert.equal(natural.imageUrl, '/api/catalogue-image/arturo-fuente-exquisitos-natural?v=20260921');
  assert.notEqual(natural.imageUrl, parent.imageUrl);
});

test('server markup renders Blend above Size', () => {
  const dom = mount();
  const card = cardOf(dom);
  const blend = card.querySelector('[data-blend-select]');
  const size = card.querySelector('[data-variant-select]');
  assert.ok(blend);
  assert.ok(size);
  assert.equal(blend.value, 'sun-grown');
  assert.equal(size.value, 'juniors');
  assert.ok(
    blend.closest('.blend-variants').compareDocumentPosition(size.closest('.size-variants')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'Blend selector should render before Size'
  );
});

test('selecting Maduro rewrites blend data and hides the irrelevant Size selector', async () => {
  const dom = mount();
  const api = await runtime();
  api.setVariantState(state());

  const result = api.selectBlend(ROCKY.key, 'maduro');
  const card = cardOf(dom);

  assert.equal(result.blendVariantId, 'maduro');
  assert.equal(card.dataset.activeBlend, 'maduro');
  assert.equal(card.querySelector('[data-blend-select]').value, 'maduro');
  assert.equal(card.querySelector('h3').textContent, 'Rocky PatelSun Grown Maduro Robusto');
  assert.equal(card.querySelectorAll('.facts > div')[1].querySelector('b').textContent, 'A$47.30');
  assert.equal(card.querySelectorAll('.facts > div')[2].querySelector('b').textContent, '5″ × 50');
  assert.equal(card.querySelector('.artmeta-left').textContent.includes('Wrapper: Broadleaf Maduro'), true);
  assert.equal(ratingScore(card, 'Strength'), '8/10');
  assert.equal(ratingScore(card, 'Quality'), '9/10');
  assert.equal(card.querySelector('.size-variants').hidden, true);
  assert.equal(card.querySelector('p.mog-note').textContent, 'Untasted.');
});

test('switching back to Sun Grown restores its Size selector and base Production', async () => {
  const dom = mount();
  const api = await runtime();
  api.setVariantState(state());

  api.selectBlend(ROCKY.key, 'maduro');
  api.selectBlend(ROCKY.key, 'sun-grown');
  const card = cardOf(dom);

  assert.equal(card.dataset.activeBlend, 'sun-grown');
  assert.equal(card.querySelector('.size-variants').hidden, false);
  assert.deepEqual(
    [...card.querySelectorAll('[data-variant-select] option')].map(option => option.value),
    ['juniors', 'robusto']
  );
  assert.equal(card.querySelector('[data-variant-select]').value, 'juniors');
  assert.equal(card.querySelector('h3').textContent, 'Rocky PatelSun Grown Juniors');
  assert.equal(card.querySelector('.artmeta-left').textContent.includes('Wrapper: Ecuadorian Sumatra Sun Grown'), true);
});

test('blend selections are deep-linkable and searchable', async () => {
  const dom = mount();
  const api = await runtime();
  api.setVariantState(state());

  api.selectBlend(ROCKY.key, 'maduro');
  assert.match(dom.window.location.href, /blend=rocky-patel-sun-grown-juniors%3Amaduro/);
  assert.deepEqual(api.readBlendFromUrl(dom.window.location.href),
    { key: ROCKY.key, blendVariantId: 'maduro' });

  const hit = resolveSearchQuery('Rocky Patel Sun Grown Maduro', [ROCKY]);
  assert.equal(hit.key, ROCKY.key);
  assert.equal(hit.blendVariantId, 'maduro');
});

test('promoting a blend saves only its display default', async () => {
  const dom = mount({ admin: true });
  const api = await runtime();
  const live = state();
  api.setVariantState(live);
  api.selectBlend(ROCKY.key, 'maduro');

  const sent = [];
  const fetchImpl = async (url, options) => {
    sent.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200 };
  };
  const patch = await api.promoteActiveBlend(ROCKY.key, { fetchImpl });

  assert.deepEqual(patch, { defaultBlendVariantId: 'maduro' });
  assert.equal(sent.length, 1);
  assert.deepEqual(Object.keys(sent[0].body.cards[ROCKY.key]), ['defaultBlendVariantId']);
  assert.deepEqual(Object.keys(sent[0].body.entries[ROCKY.key]), ['defaultBlendVariantId']);
  assert.equal(live.cards[ROCKY.key].defaultBlendVariantId, 'maduro');
});
