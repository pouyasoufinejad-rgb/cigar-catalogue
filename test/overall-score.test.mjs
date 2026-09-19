import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { SCORE_WEIGHTS, deriveOverallScore, overallScoreMarkup } from '../public/catalogue-overall-score.mjs';
import { deriveAutoLaurel } from '../public/catalogue-flavour.mjs';
import { countryLabel } from '../src/index.js';

test('the weights are the stated split and total exactly 100 at full marks', () => {
  assert.deepEqual(SCORE_WEIGHTS, {
    quality: 3, flavour: 3, size: 2, value: 1.2, strength: 0.8
  });
  const total = Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight * 10, 0);
  assert.equal(total, 100);
  assert.equal(deriveOverallScore({ strength: 10, quality: 10, flavour: 10, size: 10, value: 10 }).score, 100);
});

test('a fully rated cigar is scored by the plain formula', () => {
  const ratings = { quality: 8, flavour: 7, size: 9, value: 6, strength: 8 };
  const expected = 8 * 3 + 7 * 3 + 9 * 2 + 6 * 1.2 + 8 * 0.8; // 24 + 21 + 18 + 7.2 + 6.4
  const result = deriveOverallScore(ratings);
  assert.ok(Math.abs(expected - 76.6) < 1e-9, 'the weighted total is 76.6 before rounding');
  assert.equal(result.score, 77, 'rounded to the nearest whole number');
  assert.equal(result.provisional, false);
  assert.deepEqual(result.missing, []);
});

test('an unrated Flavour is rescaled over the remaining weights rather than scored as zero', () => {
  const ratings = { quality: 8, flavour: null, size: 9, value: 6, strength: 8 };
  const result = deriveOverallScore(ratings);

  // 30% of the weight is absent, so the 70 points available are scaled back up to 100.
  const earned = 8 * 3 + 9 * 2 + 6 * 1.2 + 8 * 0.8;
  assert.equal(Math.round((earned / 70) * 100), result.score);
  assert.equal(result.provisional, true);
  assert.deepEqual(result.missing, ['flavour']);

  // Scoring it as zero would have capped the same cigar in the fifties.
  assert.ok(result.score > Math.round(earned), 'rescaling must not simply drop the missing weight');
});

test('a cigar with nothing rated has no score rather than a zero', () => {
  const result = deriveOverallScore({});
  assert.equal(result.score, null);
  assert.equal(overallScoreMarkup({}), '');
});

test('the markup renders the score, the denominator and a tier', () => {
  const dom = new JSDOM(`<!doctype html><body>${overallScoreMarkup({
    quality: 9, flavour: 9, size: 9, value: 8, strength: 9
  })}</body>`);
  const node = dom.window.document.querySelector('.overall-score');
  assert.ok(node);
  assert.equal(node.querySelector('b').textContent, '89');
  assert.equal(node.querySelector('small').textContent, '/100');
  assert.ok(node.classList.contains('gold'));
  assert.equal(node.classList.contains('is-provisional'), false);
});

test('a provisional score is marked as such', () => {
  const dom = new JSDOM(`<!doctype html><body>${overallScoreMarkup({
    quality: 9, flavour: null, size: 9, value: 8, strength: 9
  })}</body>`);
  assert.ok(dom.window.document.querySelector('.overall-score.is-provisional'));
});

test('the /100 score has no bearing on Gem or Crown eligibility', () => {
  // A very high score with only four Golds stays a Crown.
  const fourGolds = { strength: 10, quality: 10, flavour: 6, size: 'gold', value: 10 };
  assert.equal(deriveAutoLaurel(fourGolds), 'crown');
  // 10*3 + 6*3 + 10*2 + 10*1.2 + 10*0.8 = 88.
  assert.equal(deriveOverallScore({ ...fourGolds, size: 10 }).score, 88);

  // A cigar sitting on the Gold threshold everywhere is a Gem despite a middling score.
  const fiveGolds = { strength: 7, quality: 7, flavour: 7, size: 'gold', value: 7 };
  assert.equal(deriveAutoLaurel(fiveGolds), 'gem');
  assert.equal(deriveOverallScore({ ...fiveGolds, size: 7 }).score, 70);
});

test('the Dominican Republic is always shortened to DR', () => {
  assert.equal(countryLabel('Dominican Republic'), 'DR');
  assert.equal(countryLabel('dominican republic'), 'DR');
  assert.equal(countryLabel('  Dominican Republic  '), 'DR');
  assert.equal(countryLabel('Brazil / Dominican Republic'), 'Brazil / DR');
  // Everything else is left exactly as it is.
  assert.equal(countryLabel('DR'), 'DR');
  assert.equal(countryLabel('Nicaragua'), 'Nicaragua');
  assert.equal(countryLabel('BRA/DR'), 'BRA/DR');
  assert.equal(countryLabel(''), '');
});
