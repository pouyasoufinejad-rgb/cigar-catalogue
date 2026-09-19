import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { SCORE_WEIGHTS, deriveOverallScore, overallScoreMarkup } from '../public/catalogue-overall-score.mjs';
import { deriveAutoLaurel } from '../public/catalogue-flavour.mjs';
import { countryLabel } from '../src/index.js';

test('the weights are the stated split and total exactly 100 at full marks', () => {
  assert.deepEqual(SCORE_WEIGHTS, {
    flavour: 3.4, quality: 3, size: 1.6, value: 1.2, strength: 0.8
  });
  // Flavour outranks Quality and Size is the field it was taken from.
  assert.ok(SCORE_WEIGHTS.flavour > SCORE_WEIGHTS.quality);
  assert.ok(SCORE_WEIGHTS.size < SCORE_WEIGHTS.quality);
  const total = Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight * 10, 0);
  assert.equal(total, 100);
  assert.equal(deriveOverallScore({ strength: 10, quality: 10, flavour: 10, size: 10, value: 10 }).score, 100);
});

test('a fully rated cigar is scored by the plain formula', () => {
  const ratings = { quality: 8, flavour: 7, size: 9, value: 6, strength: 8 };
  const expected = 7 * 3.4 + 8 * 3 + 9 * 1.6 + 6 * 1.2 + 8 * 0.8; // 23.8 + 24 + 14.4 + 7.2 + 6.4
  const result = deriveOverallScore(ratings);
  assert.ok(Math.abs(expected - 75.8) < 1e-9, 'the weighted total is 75.8 before rounding');
  assert.equal(result.score, 76, 'rounded to the nearest whole number');
  assert.equal(result.provisional, false);
  assert.deepEqual(result.missing, []);
});

test('an unrated Flavour is rescaled over the remaining weights rather than scored as zero', () => {
  const ratings = { quality: 8, flavour: null, size: 9, value: 6, strength: 8 };
  const result = deriveOverallScore(ratings);

  // 34% of the weight is absent, so the 66 points available are scaled back up to 100.
  const earned = 8 * 3 + 9 * 1.6 + 6 * 1.2 + 8 * 0.8;
  assert.equal(Math.round((earned / 66) * 100), result.score);
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

test('the markup is the number alone, with the wording kept in the title', () => {
  const dom = new JSDOM(`<!doctype html><body>${overallScoreMarkup({
    quality: 9, flavour: 9, size: 9, value: 8, strength: 9
  })}</body>`);
  const node = dom.window.document.querySelector('.overall-score');
  assert.ok(node);
  assert.equal(node.textContent, '89', 'no label and no denominator on the card');
  assert.doesNotMatch(node.textContent, /overall|\/100/i);
  assert.match(node.getAttribute('title'), /out of 100/);
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
  // 6*3.4 + 10*3 + 10*1.6 + 10*1.2 + 10*0.8 = 86.4.
  assert.equal(deriveOverallScore({ ...fourGolds, size: 10 }).score, 86);

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
