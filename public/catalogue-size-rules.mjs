function finiteRing(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function sizeScoreForRing(value) {
  const ring = finiteRing(value);
  if (ring < 20) return 3;
  if (ring <= 22) return 4;
  if (ring <= 26) return 5;
  if (ring <= 30) return 6;
  if (ring <= 34) return 7;
  if (ring <= 38) return 8;
  if (ring <= 40) return 9;
  // The peak runs to 48, not 44. Stopping at 44 punished a cigar for being fatter than the
  // favourite gauge while calling the result its size: a 4x46 scored below a 4x43 despite
  // holding 14% more tobacco. Girth is only held against a cigar once it is genuinely fat.
  if (ring <= 48) return 10;
  if (ring <= 56) return 9;
  return 8;
}

// Ring alone cannot tell a 3.5in cigarillo from a 7in lancero, and they are not the same
// smoke. Length adjusts the ring's score around a 4.5in reference: short loses more than
// long gains, and the gain is capped so a very long cigar cannot run away with the score.
export const SIZE_REFERENCE_LENGTH = 4.5;
export const SIZE_LENGTH_WEIGHT = 2.5;
// Under four inches the curve steepens again. A third of the catalogue sits there and the
// gentler rate was not charging enough for it. The two rates meet exactly at four inches,
// so nothing at or above that length moves at all.
export const SIZE_SHORT_LENGTH = 4;
export const SIZE_SHORT_WEIGHT = 4.5;
// Deep enough that the steeper rate does not saturate inside the range the catalogue
// actually uses: at 4.5 per octave a three-inch cigar would otherwise sit on the floor.
export const SIZE_LENGTH_FLOOR = -3;
export const SIZE_LENGTH_CEILING = 1;

export function sizeLengthAdjustment(length) {
  const inches = finiteRing(length);
  // An entry with no length recorded falls back to its ring score rather than being
  // punished for a missing field.
  if (!(inches > 0)) return 0;
  const raw = inches >= SIZE_SHORT_LENGTH
    ? SIZE_LENGTH_WEIGHT * Math.log2(inches / SIZE_REFERENCE_LENGTH)
    : SIZE_LENGTH_WEIGHT * Math.log2(SIZE_SHORT_LENGTH / SIZE_REFERENCE_LENGTH)
      + SIZE_SHORT_WEIGHT * Math.log2(inches / SIZE_SHORT_LENGTH);
  return Math.max(SIZE_LENGTH_FLOOR, Math.min(SIZE_LENGTH_CEILING, raw));
}

export function sizeScoreForDimensions(ring, length) {
  const score = sizeScoreForRing(ring) + sizeLengthAdjustment(length);
  return Math.max(1, Math.min(10, Math.round(score)));
}

export function sizeTierForRing(value) {
  const ring = finiteRing(value);
  if (ring >= 31 && ring <= 56) return 'gold';
  if ((ring >= 23 && ring <= 30) || ring >= 57) return 'silver';
  return 'bronze';
}

// The tier comes from the same score the laurel prints, so the medal and the number can
// never disagree. At the reference length this reproduces the ring bands exactly; length
// is what moves a cigar between them.
export function sizeTierForScore(score) {
  if (score >= 7) return 'gold';
  if (score >= 5) return 'silver';
  return 'bronze';
}

export const SIZE_FAT_RING = 57;

export function sizeTierForDimensions(ring, length) {
  const tier = sizeTierForScore(sizeScoreForDimensions(ring, length));
  // A very fat cigar stays demoted whatever its volume. That band is a girth preference
  // rather than a measure of size, and it has not changed.
  if (finiteRing(ring) >= SIZE_FAT_RING && tier === 'gold') return 'silver';
  return tier;
}

export function sizeRatingForRing(value, length) {
  return {
    tier: sizeTierForDimensions(value, length),
    score: sizeScoreForDimensions(value, length),
  };
}
