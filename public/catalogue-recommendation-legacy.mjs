const LEGACY_COHORTS = ['coronets', 'petit-panatelas', 'flavoured'];
const KFC_SWEET_PONIES = 'kfc-ponies-sweets';

export const LEGACY_RECOMMENDATION_META = Object.freeze({
  coronets: Object.freeze({ name: 'Coronets', description: '34 ring gauge or lower.' }),
  'petit-panatelas': Object.freeze({ name: 'Petit Panatelas', description: '35 ring gauge or higher.' }),
  flavoured: Object.freeze({ name: 'Infused / Flavoured', description: 'Infused and flavoured recommendation cigars.' })
});

function optionalRank(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.round(number) : null;
}

function catalogueType(row = {}) {
  const explicit = String(row.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || row.taster === true) return 'taster';
  return 'main';
}

export function legacyTextLooksFlavoured(value) {
  return /\b(?:flavou?red|flavored|infused)\b/i.test(String(value || ''));
}

export function legacyRecommendationCohortForCard(row = {}) {
  if (catalogueType(row) !== 'main' || row.archived === true) return '';
  const key = String(row.key || '').trim().toLowerCase();
  const productionText = String(row.productionText ?? row.productionHtml ?? row.text ?? '');
  const explicitlyFlavoured = typeof row.flavoured === 'boolean'
    ? row.flavoured
    : typeof row.infused === 'boolean'
      ? row.infused
      : null;
  const flavoured = key !== KFC_SWEET_PONIES
    && (explicitlyFlavoured === true || (explicitlyFlavoured !== false && legacyTextLooksFlavoured(productionText)));
  if (flavoured) return 'flavoured';

  const ring = Number(row.ring);
  if (!Number.isFinite(ring) || ring <= 0) return '';
  return ring <= 34 ? 'coronets' : 'petit-panatelas';
}

function legacySortRank(row, cohort) {
  const persistedCohort = String(row.recommendationCohort || row.persistedCohort || '').trim();
  const scoped = !persistedCohort || persistedCohort === cohort
    ? optionalRank(row.recommendationRank)
    : null;
  return scoped ?? optionalRank(row.legacyRank ?? row.rank) ?? Number.MAX_SAFE_INTEGER;
}

export function buildLegacyRecommendationSubsections(rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  return LEGACY_COHORTS.map(id => {
    const meta = LEGACY_RECOMMENDATION_META[id];
    const members = source
      .map(row => ({ ...row, cohort: legacyRecommendationCohortForCard(row) }))
      .filter(row => row.cohort === id)
      .sort((a, b) => {
        const ar = legacySortRank(a, id);
        const br = legacySortRank(b, id);
        return ar - br
          || (optionalRank(a.legacyRank ?? a.rank) ?? Number.MAX_SAFE_INTEGER)
            - (optionalRank(b.legacyRank ?? b.rank) ?? Number.MAX_SAFE_INTEGER)
          || String(a.key || '').localeCompare(String(b.key || ''));
      });
    return {
      id,
      name: meta.name,
      description: meta.description,
      entryKeys: members.map(row => String(row.key || '').trim()).filter(Boolean)
    };
  });
}

export { LEGACY_COHORTS };
