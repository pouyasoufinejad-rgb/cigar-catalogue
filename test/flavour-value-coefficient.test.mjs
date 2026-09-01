import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { deriveValue, flavourValueMultiplier } from '../public/catalogue-value.mjs';

const flavourRuntime = await readFile(new URL('../public/catalogue-flavour.mjs', import.meta.url), 'utf8');

test('Flavour below 7 does not alter the value ratio', () => {
  assert.equal(flavourValueMultiplier(null), 1);
  assert.equal(flavourValueMultiplier(1), 1);
  assert.equal(flavourValueMultiplier(6), 1);
  assert.equal(deriveValue(14, 7).ratio, 1);
  assert.equal(deriveValue(14, 7, 6).ratio, 1);
});

test('Flavour 7-10 reduces the value ratio by 10-40 percent', () => {
  assert.equal(flavourValueMultiplier(7), 0.9);
  assert.equal(flavourValueMultiplier(8), 0.8);
  assert.equal(flavourValueMultiplier(9), 0.7);
  assert.equal(flavourValueMultiplier(10), 0.6);
  assert.equal(deriveValue(14, 7, 7).ratio, 0.9);
  assert.equal(deriveValue(14, 7, 8).ratio, 0.8);
  assert.equal(deriveValue(14, 7, 9).ratio, 0.7);
  assert.equal(deriveValue(14, 7, 10).ratio, 0.6);
});

test('the adjusted ratio feeds the existing logarithmic Value score', () => {
  assert.equal(deriveValue(14, 7, 6).score, 6);
  assert.equal(deriveValue(14, 7, 7).score, 7);
  assert.equal(deriveValue(14, 7, 8).score, 7);
  assert.equal(deriveValue(14, 7, 9).score, 8);
  assert.equal(deriveValue(14, 7, 10).score, 9);
});

test('Flavour runtime recalculates card Value before automatic laurels', () => {
  assert.match(flavourRuntime, /deriveValue/);
  assert.match(flavourRuntime, /refreshValueForCard\(card, flavour\)/);
  assert.match(flavourRuntime, /refreshValueForCard\(card, flavour\);[\s\S]*refreshLaurelForCard\(card, saved\)/);
});

test('editing Flavour, Quality or price refreshes the flavour-aware Value preview', () => {
  assert.match(flavourRuntime, /previewFlavourAdjustedValue/);
  assert.match(flavourRuntime, /catalogue-admin-flavour/);
  assert.match(flavourRuntime, /catalogue-admin-quality/);
  assert.match(flavourRuntime, /catalogue-v139-price/);
});
