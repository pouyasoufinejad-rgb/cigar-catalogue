if (typeof document !== 'undefined') {
  import('./catalogue-direct-edit.mjs');
  import('./catalogue-direct-persistence.mjs');
  import('./catalogue-flavour.mjs');
  import('./catalogue-card-layout.mjs');
}

export const QUALITY_BENCHMARKS = Object.freeze({
  1: 1.75, 2: 2.50, 3: 3.50, 4: 5, 5: 7,
  6: 10, 7: 14, 8: 18, 9: 22, 10: 26
});

function clampScore(value) {
  const number = Number(value);
  return Math.max(1, Math.min(10, Math.round(Number.isFinite(number) ? number : 1)));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function flavourValueMultiplier(flavour) {
  const number = Number(flavour);
  if (!Number.isFinite(number)) return 1;
  const score = Math.max(1, Math.min(10, Math.round(number)));
  if (score < 7) return 1;
  return 1 - ((score - 6) * 0.1);
}

export function deriveValue(price, quality, flavour = null) {
  const q = clampScore(quality);
  const benchmark = QUALITY_BENCHMARKS[q];
  const p = Math.max(0, finiteNumber(price));
  const baseRatio = p > 0 ? p / benchmark : NaN;
  const flavourMultiplier = flavourValueMultiplier(flavour);
  const ratio = Number.isFinite(baseRatio) ? baseRatio * flavourMultiplier : NaN;
  const raw = Number.isFinite(ratio) && ratio > 0 ? 6 - 3.5 * Math.log2(ratio) : 1;
  return {
    benchmark,
    baseRatio,
    flavourMultiplier,
    ratio,
    score: Math.max(1, Math.min(10, Math.round(raw)))
  };
}
