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
  SIZE_SHORT_LENGTH,
  SIZE_SHORT_WEIGHT,
  SIZE_LENGTH_WEIGHT,
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
    [45, 10], [48, 10],
    [49, 9], [56, 9],
    [57, 8], [70, 8],
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
  assert.deepEqual(sizeRatingForRing(50), { tier: 'gold', score: 9 });
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
    [5, 50, 9], [6, 52, 10], [7, 48, 10], [7, 20, 5]
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
  // A stub loses the gold its girth alone would have bought, now that under four inches
  // charges 4.5 a octave and the floor reaches -3.
  assert.equal(sizeTierForRing(50), 'gold');
  assert.equal(sizeTierForDimensions(50, 2.5), 'silver');
  assert.equal(sizeTierForDimensions(33, 3), 'silver', 'a short thin one does lose it');
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


test('a fatter cigar of the same length never scores below a thinner one', () => {
  // The bug this pins: KFC Sweets Chunky at 4x46 scored 9 while Deadwood Leather Rose
  // Petite Corona at 4x43 scored 10, although the Chunky holds 14% more tobacco. A score
  // called Size cannot go down as the cigar gets bigger, short of genuinely fat.
  assert.ok(sizeScoreForDimensions(46, 4) >= sizeScoreForDimensions(43, 4),
    'the Chunky must not rank below the Leather Rose');
  assert.equal(sizeScoreForDimensions(46, 4), 10);
  assert.equal(sizeScoreForDimensions(43, 4), 10);

  // And generally, across the range the catalogue actually uses.
  // Up to the top of the plateau. Above 48 a deliberate fat penalty takes over, which is
  // a girth preference and not this rule's business.
  for (let ring = 20; ring < 48; ring += 1) {
    assert.ok(sizeScoreForDimensions(ring + 1, 4.5) >= sizeScoreForDimensions(ring, 4.5),
      `${ring + 1} RG scored below ${ring} RG`);
  }
  assert.ok(sizeScoreForDimensions(49, 4.5) < sizeScoreForDimensions(48, 4.5),
    'and the fat penalty above 48 is intentional');
});


test('under four inches is charged at a steeper rate than above it', () => {
  assert.ok(SIZE_SHORT_WEIGHT > SIZE_LENGTH_WEIGHT,
    'a short cigar should lose more per inch than a long one gains');

  // The two rates have to meet exactly at the boundary, or a hair either side of four
  // inches would jump a score for no reason anyone could explain.
  const below = sizeLengthAdjustment(SIZE_SHORT_LENGTH - 0.0001);
  const at = sizeLengthAdjustment(SIZE_SHORT_LENGTH);
  assert.ok(Math.abs(below - at) < 0.001, `${below} and ${at} should meet at the boundary`);

  // Steeper below, and strictly so.
  const gentle = inches => SIZE_LENGTH_WEIGHT * Math.log2(inches / 4.5);
  for (const inches of [3, 3.25, 3.5, 3.75]) {
    assert.ok(sizeLengthAdjustment(inches) < gentle(inches),
      `${inches}in should be charged more than the old flat rate`);
  }
  // Nothing at or above four inches moves at all.
  for (const inches of [4, 4.25, 4.5, 5, 6, 7]) {
    assert.ok(Math.abs(sizeLengthAdjustment(inches) - Math.max(-3, Math.min(1, gentle(inches)))) < 1e-9,
      `${inches}in must be untouched`);
  }
});

test('the short-cigar penalty does not saturate inside the catalogue', () => {
  // The catalogue holds cards down to 3in. If the floor bound before that, every short
  // cigar below the floor would score the same however short it got.
  assert.ok(sizeLengthAdjustment(3) > SIZE_LENGTH_FLOOR,
    'a three-inch cigar should still be on the curve, not pinned to the floor');
  assert.ok(sizeLengthAdjustment(3.5) > sizeLengthAdjustment(3),
    'and shorter must always mean a bigger penalty through that range');
  assert.ok(sizeLengthAdjustment(3) > sizeLengthAdjustment(2.5));
});
