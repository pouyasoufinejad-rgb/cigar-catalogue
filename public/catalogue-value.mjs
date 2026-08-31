import './catalogue-direct-edit.mjs';

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

export function deriveValue(price, quality) {
  const q = clampScore(quality);
  const benchmark = QUALITY_BENCHMARKS[q];
  const p = Math.max(0, finiteNumber(price));
  const ratio = p > 0 ? p / benchmark : NaN;
  const raw = Number.isFinite(ratio) && ratio > 0 ? 6 - 3.5 * Math.log2(ratio) : 1;
  return {
    benchmark,
    ratio,
    score: Math.max(1, Math.min(10, Math.round(raw)))
  };
}
