import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { renderEntryCard, isEmptyCheapestSingle, visiblePracticalLines } from '../src/index.js';
import { isEmptyCheapestSingle as runtimeIsEmpty } from '../public/catalogue-variant-runtime.mjs';

const ENTRY = Object.freeze({
  key: 'no-single', brand: 'Liga Privada', title: 'No. 9 Coronets', country: 'Nicaragua',
  strength: 8, quality: 9, risk: 1, rank: 1, length: 4, ring: 32,
  packagePrice: 130, packageLabel: 'tin of 10', price: 13,
  practicalLines: ['Tin of 10', 'Uncut', 'Cheapest single: no in-stock Australian single found']
});

test('a line that only reports the absence of a single is not rendered', () => {
  const dom = new JSDOM(`<!doctype html><body>${renderEntryCard(ENTRY)}</body>`);
  const text = dom.window.document.body.textContent;
  assert.doesNotMatch(text, /no in-stock Australian single found/i,
    'it said nothing a reader could act on, and it said it twice');
  assert.equal(dom.window.document.querySelector('.cheapest-single'), null,
    'and it should not get its own box either');
  // The other practical lines are untouched.
  assert.match(text, /Tin of 10/);
  assert.match(text, /Uncut/);
});

test('a real cheapest single still shows, in both places it belongs', () => {
  const entry = { ...ENTRY, practicalLines: ['Tin of 10', 'Cheapest single: A$13.00 · The Index'] };
  const dom = new JSDOM(`<!doctype html><body>${renderEntryCard(entry)}</body>`);
  const box = dom.window.document.querySelector('.cheapest-single');
  assert.ok(box, 'a real price keeps its box');
  assert.match(box.textContent, /A\$13\.00 · The Index/);
  assert.match(dom.window.document.querySelector('.artmeta-right')?.textContent || '', /Cheapest single/);
});

test('the rule catches the ways an absence gets written, and nothing else', () => {
  for (const line of [
    'Cheapest single: no in-stock Australian single found',
    'Cheapest single: No Australian single sold',
    'cheapest single:  none found',
    'Cheapest single: not sold as a single',
    'Cheapest single: n/a',
    'Cheapest single: —'.replace('—', '--')
  ]) assert.ok(isEmptyCheapestSingle(line), `should be treated as empty: ${line}`);

  for (const line of [
    'Cheapest single: A$13.00 · The Index',
    'Cheapest single: A$29.00 · CigarHut',
    'Tin of 10',
    'Nicotine: moderate'
  ]) assert.ok(!isEmptyCheapestSingle(line), `should be kept: ${line}`);
});

test('the Worker and the browser runtime agree, or one would re-add what the other hid', () => {
  for (const line of [
    'Cheapest single: no in-stock Australian single found',
    'Cheapest single: A$13.00 · The Index',
    'Cheapest single: none found',
    'Uncut'
  ]) assert.equal(runtimeIsEmpty(line), isEmptyCheapestSingle(line), line);
});

test('filtering leaves every other practical line in its original order', () => {
  const lines = ['Tin of 10', 'Cheapest single: no in-stock Australian single found', 'Uncut', 'Protected'];
  assert.deepEqual(visiblePracticalLines(lines), ['Tin of 10', 'Uncut', 'Protected']);
  assert.deepEqual(visiblePracticalLines([]), []);
  assert.deepEqual(visiblePracticalLines(undefined), []);
});
