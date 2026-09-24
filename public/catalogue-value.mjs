export const QUALITY_BENCHMARKS = Object.freeze({
  1: 1.75, 2: 2.50, 3: 3.50, 4: 5, 5: 7,
  6: 10, 7: 14, 8: 18, 9: 22, 10: 26
});

export const SIZE_BASE_LENGTH = 4;
export const SIZE_BASE_RING = 32;
export const SIZE_EXPONENT = 0.5;
// Below the baseline the curve is steeper, so a small cigar keeps less of the discount its
// size would otherwise buy. Above the baseline nothing changes: a bigger cigar earns what
// it already earned, and no more. The two meet at 1, so there is no step at the baseline.
export const SIZE_SMALL_EXPONENT = 0.65;

function clampScore(value) {
  const number = Number(value);
  return Math.max(1, Math.min(10, Math.round(Number.isFinite(number) ? number : 1)));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normaliseCatalogueType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'half' || type === 'half-cigar' || type === 'halfcigar') return 'half';
  return type;
}

function isSessionUnit(value) {
  const unit = String(value || '').trim().toLowerCase();
  return unit === 'session' || unit === 'half-session' || unit === 'smoking-unit';
}

export function flavourValueMultiplier(flavour) {
  const number = Number(flavour);
  if (!Number.isFinite(number)) return 1;
  const score = Math.max(1, Math.min(10, Math.round(number)));
  if (score < 7) return 1;
  return 1 - ((score - 6) * 0.1);
}

export function sizeFactor(length, ring) {
  const l = Math.max(0, finiteNumber(length));
  const r = Math.max(0, finiteNumber(ring));
  if (!(l > 0) || !(r > 0)) return 1;
  // Volume, not girth: a long thin cigar and a short thin one are not the same smoke.
  const rawSize = (l * (r ** 2)) / (SIZE_BASE_LENGTH * (SIZE_BASE_RING ** 2));
  return rawSize ** (rawSize < 1 ? SIZE_SMALL_EXPONENT : SIZE_EXPONENT);
}

export function resolveSmokingUnit({ price, length, ring, catalogueType = '', valueUnit = '' } = {}) {
  const p = Math.max(0, finiteNumber(price));
  const l = Math.max(0, finiteNumber(length));
  const r = Math.max(0, finiteNumber(ring));
  const split = normaliseCatalogueType(catalogueType) === 'half' && !isSessionUnit(valueUnit);
  return {
    price: split ? p / 2 : p,
    length: split ? l / 2 : l,
    ring: r,
    split
  };
}

export function deriveValue(price, quality, flavour = null, options = {}) {
  const q = clampScore(quality);
  const benchmark = QUALITY_BENCHMARKS[q];
  const unit = resolveSmokingUnit({
    price,
    length: options?.length,
    ring: options?.ring,
    catalogueType: options?.catalogueType,
    valueUnit: options?.valueUnit
  });
  const baseRatio = unit.price > 0 ? unit.price / benchmark : NaN;
  const flavourMultiplier = flavourValueMultiplier(flavour);
  const valueSizeFactor = sizeFactor(unit.length, unit.ring);
  const ratio = Number.isFinite(baseRatio)
    ? (baseRatio * flavourMultiplier) / valueSizeFactor
    : NaN;
  const raw = Number.isFinite(ratio) && ratio > 0 ? 6 - 3.5 * Math.log2(ratio) : 1;
  return {
    benchmark,
    baseRatio,
    flavourMultiplier,
    sizeFactor: valueSizeFactor,
    ratio,
    score: Math.max(1, Math.min(10, Math.round(raw))),
    sessionPrice: unit.price,
    sessionLength: unit.length,
    sessionRing: unit.ring,
    split: unit.split
  };
}
