const QUALITY_AWARD_EXCEPTION_KEYS = new Set([
  'alonso-menendez-axe-charutos'
]);

function normaliseKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function hasQualityAwardException(key) {
  return QUALITY_AWARD_EXCEPTION_KEYS.has(normaliseKey(key));
}
