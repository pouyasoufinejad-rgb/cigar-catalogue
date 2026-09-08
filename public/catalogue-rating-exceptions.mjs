const QUALITY_AWARD_EXCEPTION_KEYS = new Set([
  'alonso-menendez-axe-charutos'
]);

function normaliseKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function qualityCountsForAwards(key, qualityGold = false) {
  return Boolean(qualityGold) || QUALITY_AWARD_EXCEPTION_KEYS.has(normaliseKey(key));
}
