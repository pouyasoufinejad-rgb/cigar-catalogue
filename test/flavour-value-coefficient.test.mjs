import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SIZE_EXPONENT,
  SIZE_SMALL_EXPONENT,
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


test('the size coefficient is volume, not girth', () => {
  // A long thin cigar and a short thin one are not the same smoke, so the coefficient has
  // to separate them. Ring alone cannot.
  assert.ok(sizeFactor(7, 20) > sizeFactor(3.5, 20),
    'doubling the length has to move the coefficient');
  assert.ok(Math.abs(sizeFactor(7, 20) / sizeFactor(3.5, 20) - 2 ** SIZE_SMALL_EXPONENT) < 1e-12,
    'and by exactly the volume ratio under the curve');
  // Girth still dominates, because it is squared.
  assert.ok(sizeFactor(4, 44) > sizeFactor(5.5, 32));
});

test('small cigars are penalised harder while big ones earn no more than before', () => {
  assert.ok(SIZE_SMALL_EXPONENT > SIZE_EXPONENT,
    'a steeper exponent below the baseline is what makes small harsher');
  const symmetric = (l, r) => ((l * r ** 2) / (4 * 32 ** 2)) ** SIZE_EXPONENT;

  for (const [l, r] of [[3.5, 20], [4, 30], [3, 26]]) {
    assert.ok(sizeFactor(l, r) < symmetric(l, r),
      `${l}x${r} should keep less of the discount than the old curve gave it`);
  }
  // Above the baseline nothing moves. Rewarding big cigars more was explicitly not wanted.
  for (const [l, r] of [[4.5, 42], [5, 50], [6, 52], [7, 48]]) {
    assert.equal(sizeFactor(l, r), symmetric(l, r), `${l}x${r} must be untouched`);
  }
  assert.equal(sizeFactor(4, 32), 1, 'and the two curves meet at the baseline, with no step');
});

test('a harsher small-size coefficient lowers the Value score, not raises it', () => {
  // The coefficient divides the price ratio, so a smaller factor means a worse ratio and a
  // worse Value. Getting this backwards would quietly reward the cigars it means to punish.
  const small = deriveValue(12, 7, 6, { length: 3.5, ring: 20 });
  const baseline = deriveValue(12, 7, 6, { length: 4, ring: 32 });
  assert.ok(small.sizeFactor < baseline.sizeFactor);
  assert.ok(small.ratio > baseline.ratio, 'the small one should look worse value at the same price');
  assert.ok(small.score <= baseline.score);
});
