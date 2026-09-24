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
  if (ring <= 44) return 10;
  if (ring <= 48) return 9;
  if (ring <= 56) return 8;
  return 7;
}

// Ring alone cannot tell a 3.5in cigarillo from a 7in lancero, and they are not the same
// smoke. Length adjusts the ring's score around a 4.5in reference: short loses more than
// long gains, and the gain is capped so a very long cigar cannot run away with the score.
export const SIZE_REFERENCE_LENGTH = 4.5;
export const SIZE_LENGTH_WEIGHT = 2.5;
export const SIZE_LENGTH_FLOOR = -2;
export const SIZE_LENGTH_CEILING = 1;

export function sizeLengthAdjustment(length) {
  const inches = finiteRing(length);
  // An entry with no length recorded falls back to its ring score rather than being
  // punished for a missing field.
  if (!(inches > 0)) return 0;
  const raw = SIZE_LENGTH_WEIGHT * Math.log2(inches / SIZE_REFERENCE_LENGTH);
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

export function sizeRatingForRing(value, length) {
  return {
    tier: sizeTierForRing(value),
    score: sizeScoreForDimensions(value, length),
  };
}
