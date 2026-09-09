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

export function sizeTierForRing(value) {
  const ring = finiteRing(value);
  if (ring >= 31 && ring <= 56) return 'gold';
  if ((ring >= 23 && ring <= 30) || ring >= 57) return 'silver';
  return 'bronze';
}

export function sizeRatingForRing(value) {
  return {
    tier: sizeTierForRing(value),
    score: sizeScoreForRing(value),
  };
}
