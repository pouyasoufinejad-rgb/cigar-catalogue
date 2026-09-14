import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  normaliseNextConvenienceState,
  toggleNextCompareKey,
  nextCardMatchesFilter,
  retailerOfferFor
} from '../public/catalogue-next-convenience.mjs';

const runtime = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const source = await readFile(new URL('../public/catalogue-next-convenience.mjs', import.meta.url), 'utf8');

test('rebuilt convenience state preserves the established storage schema and compact default', () => {
  assert.deepEqual(normaliseNextConvenienceState({}), {
    version: 1,
    viewMode: 'compact',
    personalFilter: 'all',
    statuses: {},
    compare: [],
    expandedKeys: [],
    collapsedKeys: []
  });
});

test('compare keeps unique cigar keys and caps at four', () => {
  let state = normaliseNextConvenienceState();
  for (const key of ['a','b','c','d','e']) state = toggleNextCompareKey(state,key);
  assert.deepEqual(state.compare,['a','b','c','d']);
  state = toggleNextCompareKey(state,'b');
  assert.deepEqual(state.compare,['a','c','d']);
});

test('personal filters use independent status booleans', () => {
  const state = normaliseNextConvenienceState({ personalFilter:'rebuy',statuses:{ a:{rebuy:true},b:{owned:true} } });
  assert.equal(nextCardMatchesFilter(state,'a'),true);
  assert.equal(nextCardMatchesFilter(state,'b'),false);
});

test('retailer offer matching prefers exact URL and falls back to retailer label', () => {
  const result = { retailers:[
    { retailer:'CigarHut',url:'https://www.cigarhut.com.au/a/',status:'in',price:22 },
    { retailer:'Cigarworld',url:'https://www.cigarworld.com.au/b',status:'out',price:24 }
  ] };
  assert.equal(retailerOfferFor(result,'https://www.cigarworld.com.au/b/','Cigarworld').price,24);
  assert.equal(retailerOfferFor(result,'https://example.com/missing','CigarHut').price,22);
});

test('rebuilt runtime loads convenience after the new catalogue surface', () => {
  const ui = runtime.indexOf('catalogue-next-ui.mjs');
  const convenience = runtime.indexOf('catalogue-next-convenience.mjs');
  assert.ok(ui >= 0 && convenience > ui);
});

test('rebuilt convenience provides compare tray, overlay, compact/detailed mode, personal filters and retailer matrix', () => {
  for (const marker of ['catalogue-next-compare-tray','catalogue-next-compare-overlay','Compact','Detailed','Owned','Want to Try','catalogue-next-retailer-matrix']) {
    assert.match(source,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});
