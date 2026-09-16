import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SIZE_EXPONENT,
  deriveValue,
  flavourValueMultiplier,
  resolveSmokingUnit,
  sizeFactor
} from '../public/catalogue-value.mjs';

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

test('Size Factor uses a 4x32 baseline with square-root diminishing returns', () => {
  assert.equal(SIZE_EXPONENT, 0.5);
  assert.equal(sizeFactor(4, 32), 1);

  const papasFritasRaw = (4.5 * (44 ** 2)) / (4 * (32 ** 2));
  assert.ok(Math.abs(sizeFactor(4.5, 44) - Math.sqrt(papasFritasRaw)) < 1e-12);

  const toroRaw = (6 * (52 ** 2)) / (4 * (32 ** 2));
  assert.ok(Math.abs(sizeFactor(6, 52) - Math.sqrt(toroRaw)) < 1e-12);
});

test('Size Factor divides the flavour-adjusted price-to-quality ratio', () => {
  const baseline = deriveValue(14, 7, 6, { length: 4, ring: 32 });
  assert.equal(baseline.sizeFactor, 1);
  assert.equal(baseline.ratio, 1);
  assert.equal(baseline.score, 6);

  const larger = deriveValue(14, 7, 6, { length: 4.5, ring: 44 });
  assert.ok(larger.sizeFactor > 1);
  assert.ok(Math.abs(larger.ratio - (1 / larger.sizeFactor)) < 1e-12);
  assert.equal(larger.score, 8);
});

test('Half-Cigars resolve to one half-session exactly once', () => {
  assert.deepEqual(
    resolveSmokingUnit({ price: 50, length: 7, ring: 38, catalogueType: 'half' }),
    { price: 25, length: 3.5, ring: 38, split: true }
  );

  assert.deepEqual(
    resolveSmokingUnit({ price: 25, length: 3.5, ring: 38, catalogueType: 'half', valueUnit: 'session' }),
    { price: 25, length: 3.5, ring: 38, split: false }
  );

  assert.deepEqual(
    resolveSmokingUnit({ price: 50, length: 7, ring: 38, catalogueType: 'main' }),
    { price: 50, length: 7, ring: 38, split: false }
  );
});

test('missing dimensions preserve the previous Value behaviour', () => {
  const result = deriveValue(14, 7, 10);
  assert.equal(result.sizeFactor, 1);
  assert.equal(result.ratio, 0.6);
  assert.equal(result.score, 9);
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
