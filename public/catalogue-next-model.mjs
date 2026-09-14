import {
  normaliseCatalogueType,
  validateRecommendationSubsectionsShape
} from './catalogue-structure.mjs';

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function catalogueTypeOf(source = {}) {
  return normaliseCatalogueType(source.catalogueType, Boolean(source.taster));
}

export function mergedCatalogueSource(key, state = {}, domSeed = {}) {
  const safeKey = String(key || '').trim();
  return {
    ...record(domSeed?.[safeKey]),
    ...record(state?.entries?.[safeKey]),
    ...record(state?.cards?.[safeKey]),
    key: safeKey
  };
}

export function brandGroups(rows = []) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const brand = String(row?.brand || '').trim();
    if (!brand) continue;
    if (!groups.has(brand)) groups.set(brand, []);
    groups.get(brand).push(row);
  }
  return groups;
}

export function recommendationLocation(key, state = {}) {
  const target = String(key || '').trim();
  if (!target || !Array.isArray(state?.recommendationSubsections)) return null;
  const subsections = validateRecommendationSubsectionsShape(state.recommendationSubsections);
  for (const subsection of subsections) {
    const index = subsection.entryKeys.indexOf(target);
    if (index >= 0) return { subsectionId: subsection.id, index };
  }
  return null;
}

export function moveRecommendationEntry(stateInput = {}, keyInput, subsectionIdInput, targetIndexInput = 0) {
  const state = clone(record(stateInput)) || {};
  const key = String(keyInput || '').trim();
  const subsectionId = String(subsectionIdInput || '').trim();
  if (!key) throw new Error('Catalogue entry key is required.');
  if (!Array.isArray(state.recommendationSubsections)) throw new Error('Explicit Recommendation subsections are required.');

  const subsections = validateRecommendationSubsectionsShape(state.recommendationSubsections)
    .map(section => ({ ...section, entryKeys: [...section.entryKeys].filter(entryKey => entryKey !== key) }));
  const target = subsections.find(section => section.id === subsectionId);
  if (!target) throw new Error(`Recommendation subsection not found: ${subsectionId}`);
  const index = Math.max(0, Math.min(target.entryKeys.length, Math.round(Number(targetIndexInput) || 0)));
  target.entryKeys.splice(index, 0, key);
  state.version = 4;
  state.recommendationSubsections = subsections;
  return state;
}

export function moveRankedCohort(rowsInput = [], keyInput, targetIndexInput = 0, typeInput = '') {
  const rows = (Array.isArray(rowsInput) ? rowsInput : []).map(row => ({ ...row }));
  const key = String(keyInput || '').trim();
  const type = catalogueTypeOf({ catalogueType: typeInput });
  if (type === 'main') throw new Error('Main Recommendation cards are ordered by subsection entryKeys.');

  const cohort = rows
    .filter(row => !row.archived && catalogueTypeOf(row) === type)
    .sort((a, b) => (Number(a.rank) || Number.MAX_SAFE_INTEGER) - (Number(b.rank) || Number.MAX_SAFE_INTEGER));
  const selectedIndex = cohort.findIndex(row => String(row.key || '') === key);
  if (selectedIndex < 0) throw new Error(`Catalogue entry ${key} is not in the ${type} cohort.`);
  const [selected] = cohort.splice(selectedIndex, 1);
  const targetIndex = Math.max(0, Math.min(cohort.length, Math.round(Number(targetIndexInput) || 0)));
  cohort.splice(targetIndex, 0, selected);

  const ranks = new Map(cohort.map((row, index) => [String(row.key || ''), index + 1]));
  return rows.map(row => ranks.has(String(row.key || '')) ? { ...row, rank: ranks.get(String(row.key || '')) } : row);
}

export function mergeSparseCardPatch(stateInput = {}, keyInput, patchInput = {}) {
  const state = clone(record(stateInput)) || {};
  const key = String(keyInput || '').trim();
  if (!key) throw new Error('Catalogue entry key is required.');
  state.cards = record(state.cards);
  const existing = record(state.cards[key]);
  const patch = { ...record(patchInput) };
  delete patch.value;
  const next = { ...existing, ...patch };
  delete next.value;
  state.cards[key] = next;
  return state;
}

const EDITABLE_FIELDS = new Set([
  'brand', 'title', 'eyebrow', 'summaryHtml', 'noteHtml', 'packagePrice', 'packageLabel', 'price',
  'country', 'length', 'ring', 'strength', 'quality', 'risk', 'stockPin', 'catalogueType', 'taster',
  'retailerLinks', 'smokeTime', 'experienceTags', 'productionHtml', 'practicalHtml', 'rank', 'archived', 'laurel'
]);

export function editablePatch(fieldInput, value, source = {}) {
  const field = String(fieldInput || '').trim();
  if (field === 'value') throw new Error('Value is derived automatically and cannot be edited directly.');
  if (!EDITABLE_FIELDS.has(field)) throw new Error(`Unsupported editable field: ${field}`);

  if (field === 'rank') return { rank: Math.max(1, Math.round(Number(value) || 1)) };
  if (field === 'archived' || field === 'taster') return { [field]: Boolean(value) };
  if (['packagePrice', 'price', 'length', 'ring', 'strength', 'quality', 'risk'].includes(field)) {
    const number = Number(value);
    return { [field]: Number.isFinite(number) ? number : Number(source?.[field]) || 0 };
  }
  if (field === 'retailerLinks' || field === 'experienceTags') {
    const values = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
    return { [field]: values.map(item => String(item || '').trim()).filter(Boolean) };
  }
  if (field === 'catalogueType') {
    const type = catalogueTypeOf({ catalogueType: value });
    return { catalogueType: type, taster: type === 'taster' };
  }
  return { [field]: String(value ?? '') };
}
