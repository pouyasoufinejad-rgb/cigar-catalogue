import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  sizeScoreForRing,
  sizeScoreForDimensions,
  sizeLengthAdjustment,
  sizeTierForRing,
  sizeTierForDimensions,
  sizeTierForScore,
  sizeRatingForRing,
  SIZE_REFERENCE_LENGTH,
  SIZE_LENGTH_FLOOR,
  SIZE_LENGTH_CEILING,
} from '../public/catalogue-size-rules.mjs';

test('size score follows the agreed ring-gauge preference bands', () => {
  const cases = [
    [20, 4], [22, 4],
    [23, 5], [26, 5],
    [27, 6], [30, 6],
    [31, 7], [34, 7],
    [35, 8], [38, 8],
    [39, 9], [40, 9],
    [41, 10], [44, 10],
    [45, 9], [48, 9],
    [49, 8], [56, 8],
  ];

  for (const [ring, expected] of cases) {
    assert.equal(sizeScoreForRing(ring), expected, `${ring} RG`);
  }
});

test('Size Gold is exactly 31 through 56 ring gauge', () => {
  assert.equal(sizeTierForRing(30), 'silver');
  assert.equal(sizeTierForRing(31), 'gold');
  assert.equal(sizeTierForRing(56), 'gold');
  assert.equal(sizeTierForRing(57), 'silver');
});

test('size rating returns both medal tier and numeric score', () => {
  assert.deepEqual(sizeRatingForRing(32), { tier: 'gold', score: 7 });
  assert.deepEqual(sizeRatingForRing(35), { tier: 'gold', score: 8 });
  assert.deepEqual(sizeRatingForRing(42), { tier: 'gold', score: 10 });
  assert.deepEqual(sizeRatingForRing(50), { tier: 'gold', score: 8 });
});

test('catalogue runtime loader installs the updated size presentation', () => {
  const source = fs.readFileSync(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
  // The module has to carry a version token, or a returning browser keeps the cached copy
  // that still scores Size from ring alone.
  assert.match(source, /import\(['"]\.\/catalogue-size-presentation\.mjs\?v=[a-z0-9-]+['"]\)/);
});

test('size presentation derives card display and editor saves from length and ring', () => {
  const source = fs.readFileSync(new URL('../public/catalogue-size-presentation.mjs', import.meta.url), 'utf8');
  assert.match(source, /sizeRatingForRing\(ring, length\)/);
  assert.match(source, /subscore\.textContent = `\$\{score\}\/10`/);
  assert.match(source, /const tier = sizeTierForDimensions\(ring, length\)/);
  assert.match(source, /SAVE_BUTTON_ID/);
  assert.match(source, /syncAdminSizeFromDimensions\(document\)/);
});


test('the Size score reads length, not ring alone', () => {
  // Ring gauge cannot tell a 3.5in cigarillo from a 7in lancero, and they are not the same
  // smoke. This is the defect the score had: both landed on 4.
  assert.notEqual(sizeScoreForDimensions(20, 3.5), sizeScoreForDimensions(20, 7));
  assert.equal(sizeScoreForDimensions(20, 3.5), 3);
  assert.equal(sizeScoreForDimensions(20, 7), 5);

  // The agreed table, so a change to the curve has to be deliberate.
  const cases = [
    [3.5, 20, 3], [4, 30, 6], [4.5, 44, 10],
    [5, 50, 8], [6, 52, 9], [7, 48, 10], [7, 20, 5]
  ];
  for (const [length, ring, expected] of cases) {
    assert.equal(sizeScoreForDimensions(ring, length), expected, `${length}x${ring}`);
  }
});

test('length moves the score down further than it moves it up', () => {
  assert.ok(Math.abs(SIZE_LENGTH_FLOOR) > SIZE_LENGTH_CEILING,
    'a short cigar should lose more than a long one gains');
  // And the gain is capped, so a very long cigar cannot run away with the score.
  assert.equal(sizeLengthAdjustment(7), SIZE_LENGTH_CEILING);
  assert.equal(sizeLengthAdjustment(20), SIZE_LENGTH_CEILING);
  assert.equal(sizeLengthAdjustment(1), SIZE_LENGTH_FLOOR);
  assert.equal(sizeLengthAdjustment(SIZE_REFERENCE_LENGTH), 0, 'the reference length is neutral');
});

test('an entry with no length recorded keeps its ring score rather than being punished', () => {
  for (const ring of [20, 30, 44, 52]) {
    assert.equal(sizeScoreForDimensions(ring, 0), sizeScoreForRing(ring), `${ring} RG`);
    assert.equal(sizeScoreForDimensions(ring, null), sizeScoreForRing(ring));
    assert.equal(sizeScoreForDimensions(ring, undefined), sizeScoreForRing(ring));
  }
});

test('the score stays inside 1 to 10 at the extremes', () => {
  for (const [ring, length] of [[10, 1], [80, 20], [19, 0.5], [44, 30]]) {
    const score = sizeScoreForDimensions(ring, length);
    assert.ok(score >= 1 && score <= 10 && Number.isInteger(score), `${length}x${ring} -> ${score}`);
  }
});


test('the tier reproduces the old ring bands at the reference length', () => {
  // Length is what moves a cigar between tiers. At the neutral length nothing should have
  // moved at all, or this change quietly re-medalled the whole catalogue.
  for (let ring = 1; ring <= 80; ring += 1) {
    assert.equal(sizeTierForDimensions(ring, SIZE_REFERENCE_LENGTH), sizeTierForRing(ring),
      `${ring} RG at the reference length`);
  }
});

test('length moves a cigar between tiers', () => {
  // The defect: a lancero and a cigarillo shared a medal as well as a score.
  assert.equal(sizeTierForDimensions(20, 3.5), 'bronze');
  assert.equal(sizeTierForDimensions(20, 7), 'silver');
  // And a stubby fat one loses the gold its girth alone would have bought.
  assert.equal(sizeTierForRing(50), 'gold');
  assert.equal(sizeTierForDimensions(50, 2.5), 'silver');
});

test('the medal and the number cannot disagree', () => {
  for (const ring of [18, 20, 24, 30, 33, 40, 44, 50, 56, 60, 70]) {
    for (const length of [2.5, 3.5, 4, 4.5, 5, 6, 7]) {
      const rating = sizeRatingForRing(ring, length);
      const expected = ring >= 57 && sizeTierForScore(rating.score) === 'gold'
        ? 'silver'
        : sizeTierForScore(rating.score);
      assert.equal(rating.tier, expected, `${length}x${ring} showed ${rating.score}/10 as ${rating.tier}`);
    }
  }
});

test('a very fat cigar stays demoted however much tobacco it holds', () => {
  // That band is a girth preference, not a measure of size, and it did not change.
  assert.equal(sizeTierForDimensions(60, 7), 'silver');
  assert.equal(sizeTierForDimensions(70, 7), 'silver');
  assert.equal(sizeTierForDimensions(56, 7), 'gold', 'and it starts at 57, not before');
});

test('the editor and the catalogue agree on the tier', () => {
  // The editor carried its own thresholds, so ring 31 was gold on a card and silver in the
  // editor. Both now come from one function.
  const admin = fs.readFileSync(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');
  assert.match(admin, /import \{ sizeTierForDimensions \} from '\.\/catalogue-size-rules\.mjs'/);
  assert.doesNotMatch(admin, /if \(l >= 4 && r >= 32\) return 'gold'/,
    'the editor must not keep a second set of thresholds');
  assert.equal(sizeTierForDimensions(31, 5), 'gold', 'the case the two used to disagree on');
});
