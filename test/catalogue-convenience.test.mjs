import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  normaliseConvenienceState,
  togglePersonalStatus,
  toggleCompareKey,
  retailerLabelForUrl,
  matchRetailerStatus,
  retailerPriceAttribution,
  retailerPriceForRow,
  cardMatchesPersonalFilter,
  isCardExpanded
} from '../public/catalogue-convenience.mjs';

const moduleUrl = new URL('../public/catalogue-convenience.mjs', import.meta.url);
const runtimeModuleUrl = new URL('../public/catalogue-runtime.mjs', import.meta.url);

function state(overrides = {}) {
  return normaliseConvenienceState(overrides);
}

test('convenience state defaults to compact cards and no personal data', () => {
  assert.deepEqual(state(), {
    version: 1,
    viewMode: 'compact',
    personalFilter: 'all',
    statuses: {},
    compare: [],
    expandedKeys: [],
    collapsedKeys: []
  });
});

test('personal statuses are independent booleans per cigar', () => {
  let next = state();
  next = togglePersonalStatus(next, 'montecristo-short', 'owned');
  next = togglePersonalStatus(next, 'montecristo-short', 'rebuy');

  assert.deepEqual(next.statuses['montecristo-short'], {
    owned: true,
    tried: false,
    want: false,
    rebuy: true
  });

  next = togglePersonalStatus(next, 'montecristo-short', 'owned');
  assert.equal(next.statuses['montecristo-short'].owned, false);
  assert.equal(next.statuses['montecristo-short'].rebuy, true);
});

test('personal filters only hide cards that lack the selected independent status', () => {
  let next = state({ personalFilter: 'owned' });
  next = togglePersonalStatus(next, 'one', 'owned');
  next = togglePersonalStatus(next, 'two', 'tried');
  assert.equal(cardMatchesPersonalFilter(next, 'one'), true);
  assert.equal(cardMatchesPersonalFilter(next, 'two'), false);
  assert.equal(cardMatchesPersonalFilter({ ...next, personalFilter:'all' }, 'two'), true);
});

test('compare selection de-duplicates, toggles existing keys, and refuses a fifth cigar', () => {
  let next = state();
  for (const key of ['one', 'two', 'three', 'four']) next = toggleCompareKey(next, key, 4);
  assert.deepEqual(next.compare, ['one', 'two', 'three', 'four']);

  const limited = toggleCompareKey(next, 'five', 4);
  assert.deepEqual(limited.compare, ['one', 'two', 'three', 'four']);

  const removed = toggleCompareKey(limited, 'two', 4);
  assert.deepEqual(removed.compare, ['one', 'three', 'four']);
  const readded = toggleCompareKey(removed, 'one', 4);
  assert.deepEqual(readded.compare, ['three', 'four']);
});

test('state normalisation removes invalid and duplicate compare keys', () => {
  const next = state({
    version: 99,
    viewMode: 'broken',
    personalFilter: 'banana',
    compare: ['one', 'one', '', null, 'two', 'three', 'four', 'five'],
    expandedKeys: ['one', 'one', ''],
    collapsedKeys: ['two', 'two', null]
  });
  assert.equal(next.version, 1);
  assert.equal(next.viewMode, 'compact');
  assert.equal(next.personalFilter, 'all');
  assert.deepEqual(next.compare, ['one', 'two', 'three', 'four']);
  assert.deepEqual(next.expandedKeys, ['one']);
  assert.deepEqual(next.collapsedKeys, ['two']);
});

test('per-card disclosure overrides the compact or detailed global baseline', () => {
  assert.equal(isCardExpanded(state(), 'one'), false);
  assert.equal(isCardExpanded(state({ expandedKeys:['one'] }), 'one'), true);
  assert.equal(isCardExpanded(state({ viewMode:'detailed' }), 'one'), true);
  assert.equal(isCardExpanded(state({ viewMode:'detailed', collapsedKeys:['one'] }), 'one'), false);
});

test('retailer labels map the catalogue retailers without depending on link copy', () => {
  assert.equal(retailerLabelForUrl('https://www.cigarhut.com.au/test/'), 'CigarHut');
  assert.equal(retailerLabelForUrl('https://www.cigarworld.com.au/aud/products/test.html'), 'Cigarworld');
  assert.equal(retailerLabelForUrl('https://cigarbox.com.au/products/test'), 'CigarBox');
  assert.equal(retailerLabelForUrl('https://firmincigars.com.au/product/test/'), 'Firmin Cigars');
  assert.equal(retailerLabelForUrl('https://www.theindexcigars.com.au/products/test'), 'The Index');
  assert.equal(retailerLabelForUrl('https://ubercigar.com.au/cigars/test/'), 'Ubercigar');
});

test('retailer stock matching prefers URL and falls back to retailer label', () => {
  const result = {
    retailers: [
      { retailer: 'The Index', url: 'https://www.theindexcigars.com.au/products/test', status: 'in' },
      { retailer: 'CigarHut', url: 'https://www.cigarhut.com.au/test/', status: 'out' }
    ]
  };

  assert.equal(matchRetailerStatus(result, 'https://www.cigarhut.com.au/test/', 'CigarHut'), 'out');
  assert.equal(matchRetailerStatus(result, 'https://different.example/product', 'The Index'), 'in');
  assert.equal(matchRetailerStatus(result, 'https://different.example/product', 'Unknown Shop'), 'unknown');
  assert.equal(matchRetailerStatus(null, 'https://www.cigarhut.com.au/test/', 'CigarHut'), 'unknown');
});

test('retailer price attribution assigns the catalogue best available price to the first retailer row', () => {
  assert.equal(retailerPriceAttribution(0, 'A$100 · pack of 10', 'A$10'), 'A$100 · pack of 10 · A$10 / stick');
  assert.equal(retailerPriceAttribution(1, 'A$100 · pack of 10', 'A$10'), '—');
  assert.equal(retailerPriceAttribution(2, 'A$100 · pack of 10', 'A$10'), '—');
});

test('Undercrown Maduro Coronets rows retain verified retailer prices while live stock cache prices are unavailable', () => {
  const packageText = 'A$119 · tin of 10';
  const perStickText = 'A$11.90';
  assert.equal(retailerPriceForRow(null, 'https://www.theindexcigars.com.au/products/undercrown-maduro-coronet-tin-of-10', 'The Index', 0, packageText, perStickText), 'A$119');
  assert.equal(retailerPriceForRow(null, 'https://www.cigarhut.com.au/undercrown-maduro-coronets/', 'CigarHut', 1, packageText, perStickText), 'A$110');
  assert.equal(retailerPriceForRow(null, 'https://www.cigarworld.com.au/aud/categories/cigars/drew-estate-%28nicaragua%29/undercrown/', 'Cigarworld', 2, packageText, perStickText), 'A$132');
});

test('retailer best-price rendering is owned by the main convenience module', async () => {
  const runtimeSource = await readFile(runtimeModuleUrl, 'utf8');
  const source = await readFile(moduleUrl, 'utf8');
  assert.doesNotMatch(runtimeSource, /catalogue-retailer-best-price\.mjs/);
  assert.match(source, /retailerPriceAttribution/);
});

test('card UI contract includes four status chips plus Compare and Details controls', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  for (const label of ['Owned', 'Tried', 'Want to Try', 'Rebuy', 'Compare', 'Details']) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /catalogue-personal-controls/);
  assert.match(source, /catalogue-card-actions/);
  assert.match(source, /data-personal-filter-hidden/);
  assert.match(source, /stopPropagation\(\)/);
});

test('compact presentation hides only secondary detail groups and keeps core card identity/ratings visible', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  assert.match(source, /convenience-compact/);
  for (const selector of ['.value-calc', '.tag-groups', '.summary', '.mog-note', '.artmeta', '.retailer-matrix']) {
    assert.ok(source.includes(selector), `compact CSS should account for ${selector}`);
  }
  assert.doesNotMatch(source, /convenience-compact[^}]*h3\s*\{[^}]*display\s*:\s*none/is);
  assert.doesNotMatch(source, /convenience-compact[^}]*\.medals\s*\{[^}]*display\s*:\s*none/is);
});

test('compare UI provides a four-cigar tray and a full comparison field set', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  assert.match(source, /catalogue-compare-tray/);
  assert.match(source, /catalogue-compare-overlay/);
  assert.match(source, /Compare selected cigars/);
  assert.match(source, /Clear/);
  assert.match(source, /You can compare up to 4 cigars/);
  assert.match(source, /Escape/);
  for (const field of ['Price / stick', 'Package', 'Dimensions', 'Strength', 'Quality', 'Flavour', 'Size', 'Value', 'Smoke time', 'Stock', 'Personal status', 'Production']) {
    assert.ok(source.includes(field), `compare UI should include ${field}`);
  }
});

test('retailer matrix uses existing shop links, read-only stock cache, and preserves legacy links', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  assert.match(source, /\/api\/stock/);
  assert.match(source, /querySelectorAll\(['"]\.shop['"]\)/);
  assert.match(source, /retailer-matrix/);
  for (const heading of ['Retailer', 'Stock', 'Price', 'Open']) assert.ok(source.includes(heading));
  assert.match(source, /legacyLink\.hidden\s*=\s*true/);
  assert.doesNotMatch(source, /legacyLink\.remove\s*\(/);
});

test('convenience module is browser-local and contains no catalogue write endpoint', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  assert.doesNotMatch(source, /\/api\/catalogue-overrides/);
  assert.doesNotMatch(source, /adminWriteFetch/);
  assert.doesNotMatch(source, /method\s*:\s*['"](?:PUT|POST|DELETE|PATCH)['"]/i);
});
