export const CATALOGUE_STATE_VERSION = 4;

const MAIN_TYPE = 'main';
const HALF_TYPE = 'half';
const TASTER_TYPE = 'taster';
const SUBSECTION_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ENTRY_KEY = /^[a-z0-9][a-z0-9_-]{0,95}$/;

function cloneCardMap(input = {}) {
  return Object.fromEntries(
    Object.entries(input && typeof input === 'object' ? input : {})
      .map(([key, value]) => [key, { ...(value && typeof value === 'object' ? value : {}) }])
  );
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function positiveRank(value) {
  const number = integer(value);
  return number !== null && number >= 1 ? number : Number.MAX_SAFE_INTEGER;
}

function validEntryKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!ENTRY_KEY.test(key)) throw new Error(`Invalid Recommendation entry key: ${key || '(missing)'}.`);
  return key;
}

export function normaliseCatalogueType(value, legacyTaster = false) {
  const type = String(value || '').trim().toLowerCase();
  if (type === HALF_TYPE || type === 'half-cigar' || type === 'halfcigar') return HALF_TYPE;
  if (type === TASTER_TYPE || legacyTaster) return TASTER_TYPE;
  return MAIN_TYPE;
}

export function validateRecommendationSubsectionsShape(input) {
  if (!Array.isArray(input)) throw new Error('recommendationSubsections must be an array.');

  const subsectionIds = new Set();
  const members = new Set();

  return input.map(raw => {
    const id = String(raw?.id || '').trim().toLowerCase();
    const name = String(raw?.name || '').trim();
    const description = String(raw?.description || '').trim();

    if (!SUBSECTION_ID.test(id)) {
      throw new Error(`Invalid Recommendation subsection id: ${id || '(missing)'}.`);
    }
    if (!name) throw new Error(`Recommendation subsection "${id}" requires a name.`);
    if (subsectionIds.has(id)) throw new Error(`Duplicate Recommendation subsection id: ${id}.`);
    subsectionIds.add(id);

    if (!Array.isArray(raw?.entryKeys)) {
      throw new Error(`Recommendation subsection "${id}" requires entryKeys.`);
    }

    const entryKeys = raw.entryKeys.map(validEntryKey);
    for (const key of entryKeys) {
      if (members.has(key)) throw new Error(`Duplicate Recommendation entry membership: ${key}.`);
      members.add(key);
    }

    return { id, name, description, entryKeys };
  });
}

export function recommendationMembership(subsections) {
  const source = validateRecommendationSubsectionsShape(subsections);
  const output = {};
  for (const subsection of source) {
    subsection.entryKeys.forEach((key, index) => {
      output[key] = { subsectionId: subsection.id, position: index + 1 };
    });
  }
  return output;
}

export function recommendationLocation(subsections, keyInput) {
  const key = String(keyInput || '').trim().toLowerCase();
  if (!key) return null;
  return recommendationMembership(subsections)[key] || null;
}

export function addRecommendationSubsection(subsections, input = {}) {
  const source = validateRecommendationSubsectionsShape(subsections);
  const id = String(input.id || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  const description = String(input.description || '').trim();
  const index = input.index === undefined ? source.length : integer(input.index);

  if (!SUBSECTION_ID.test(id)) throw new Error(`Invalid Recommendation subsection id: ${id || '(missing)'}.`);
  if (!name) throw new Error(`Recommendation subsection "${id}" requires a name.`);
  if (source.some(section => section.id === id)) throw new Error(`Duplicate Recommendation subsection id: ${id}.`);
  if (index === null || index < 0 || index > source.length) {
    throw new Error(`Invalid Recommendation subsection index: ${input.index}.`);
  }

  const next = source.map(section => ({ ...section, entryKeys: [...section.entryKeys] }));
  next.splice(index, 0, { id, name, description, entryKeys: [] });
  return validateRecommendationSubsectionsShape(next);
}

export function updateRecommendationSubsection(subsections, input = {}) {
  const source = validateRecommendationSubsectionsShape(subsections);
  const id = String(input.id || '').trim().toLowerCase();
  const index = source.findIndex(section => section.id === id);
  if (index < 0) throw new Error(`Recommendation subsection not found: ${id || '(missing)'}.`);

  const next = source.map(section => ({ ...section, entryKeys: [...section.entryKeys] }));
  const current = next[index];
  const name = input.name === undefined ? current.name : String(input.name || '').trim();
  const description = input.description === undefined ? current.description : String(input.description || '').trim();
  if (!name) throw new Error(`Recommendation subsection "${id}" requires a name.`);
  next[index] = { ...current, name, description };
  return validateRecommendationSubsectionsShape(next);
}

export function reorderRecommendationSubsections(subsections, input = {}) {
  const source = validateRecommendationSubsectionsShape(subsections);
  const id = String(input.id || '').trim().toLowerCase();
  const currentIndex = source.findIndex(section => section.id === id);
  if (currentIndex < 0) throw new Error(`Recommendation subsection not found: ${id || '(missing)'}.`);
  const targetIndex = integer(input.targetIndex);
  if (targetIndex === null || targetIndex < 0 || targetIndex >= source.length) {
    throw new Error(`Invalid Recommendation subsection target index: ${input.targetIndex}.`);
  }

  const next = source.map(section => ({ ...section, entryKeys: [...section.entryKeys] }));
  const [section] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, section);
  return validateRecommendationSubsectionsShape(next);
}

export function deleteRecommendationSubsection(subsections, idInput) {
  const source = validateRecommendationSubsectionsShape(subsections);
  const id = String(idInput || '').trim().toLowerCase();
  const index = source.findIndex(section => section.id === id);
  if (index < 0) throw new Error(`Recommendation subsection not found: ${id || '(missing)'}.`);
  if (source[index].entryKeys.length) {
    throw new Error(`Recommendation subsection "${id}" is not empty.`);
  }
  return source.filter(section => section.id !== id)
    .map(section => ({ ...section, entryKeys: [...section.entryKeys] }));
}

export function removeRecommendationEntry(subsections, keyInput) {
  const source = validateRecommendationSubsectionsShape(subsections);
  const key = String(keyInput || '').trim().toLowerCase();
  if (!key) return source;
  return source.map(section => ({
    ...section,
    entryKeys: section.entryKeys.filter(entryKey => entryKey !== key)
  }));
}

export function moveRecommendationEntry(subsections, input = {}) {
  const key = validEntryKey(input.key);
  const targetSubsectionId = String(input.targetSubsectionId || '').trim().toLowerCase();
  const source = removeRecommendationEntry(subsections, key);
  const targetIndex = source.findIndex(section => section.id === targetSubsectionId);
  if (targetIndex < 0) {
    throw new Error(`Recommendation subsection not found: ${targetSubsectionId || '(missing)'}.`);
  }

  const destinationLength = source[targetIndex].entryKeys.length;
  const targetPosition = integer(input.targetPosition);
  if (targetPosition === null || targetPosition < 1 || targetPosition > destinationLength + 1) {
    throw new Error(`Invalid Recommendation position: ${input.targetPosition}.`);
  }

  const next = source.map(section => ({ ...section, entryKeys: [...section.entryKeys] }));
  next[targetIndex].entryKeys.splice(targetPosition - 1, 0, key);
  return validateRecommendationSubsectionsShape(next);
}

export function assertRecommendationInventory({
  subsections = [],
  activeRecommendationKeys = [],
  forbiddenKeys = []
} = {}) {
  const source = validateRecommendationSubsectionsShape(subsections);
  const active = new Set((Array.isArray(activeRecommendationKeys) ? activeRecommendationKeys : []).map(validEntryKey));
  const forbidden = new Set((Array.isArray(forbiddenKeys) ? forbiddenKeys : []).map(validEntryKey));
  const membership = recommendationMembership(source);

  for (const key of Object.keys(membership)) {
    if (forbidden.has(key)) throw new Error(`Forbidden Recommendation subsection member: ${key}.`);
    if (!active.has(key)) throw new Error(`Unexpected Recommendation subsection member: ${key}.`);
  }
  for (const key of active) {
    if (!membership[key]) throw new Error(`Missing active Recommendation subsection member: ${key}.`);
  }
  return true;
}

function sortedActiveCohort(cards, type, omitKey = '') {
  return Object.entries(cards)
    .filter(([key, card]) => (
      key !== omitKey
      && !card?.archived
      && normaliseCatalogueType(card?.catalogueType, Boolean(card?.taster)) === type
    ))
    .sort((a, b) => positiveRank(a[1]?.rank) - positiveRank(b[1]?.rank) || a[0].localeCompare(b[0]));
}

function compactNumberedCohort(cards, type, omitKey = '') {
  if (type !== HALF_TYPE && type !== TASTER_TYPE) return;
  sortedActiveCohort(cards, type, omitKey).forEach(([key], index) => {
    cards[key] = {
      ...cards[key],
      rank: index + 1,
      catalogueType: type,
      taster: type === TASTER_TYPE
    };
  });
}

function insertIntoNumberedCohort(cards, { key, type, position, card }) {
  if (type !== HALF_TYPE && type !== TASTER_TYPE) {
    throw new Error(`Cannot insert into numbered catalogue type: ${type}.`);
  }
  const cohort = sortedActiveCohort(cards, type, key);
  const targetPosition = integer(position);
  if (targetPosition === null || targetPosition < 1 || targetPosition > cohort.length + 1) {
    throw new Error(`Invalid ${type} position: ${position}.`);
  }
  cohort.splice(targetPosition - 1, 0, [key, { ...card }]);
  cohort.forEach(([rowKey, rowCard], index) => {
    cards[rowKey] = {
      ...cards[rowKey],
      ...rowCard,
      rank: index + 1,
      catalogueType: type,
      taster: type === TASTER_TYPE,
      ...(rowKey === key ? { archived: false, archivedAt: '' } : {})
    };
  });
}

export function applyCatalogueStructuralChange(input = {}) {
  const cards = cloneCardMap(input.cards);
  let subsections = validateRecommendationSubsectionsShape(input.recommendationSubsections || []);
  const key = validEntryKey(input.key);
  if (!Object.prototype.hasOwnProperty.call(cards, key)) {
    throw new Error(`Catalogue entry not found: ${key}.`);
  }

  const current = { ...cards[key] };
  const sourceType = normaliseCatalogueType(current.catalogueType, Boolean(current.taster));
  const targetType = normaliseCatalogueType(input.targetType, input.targetType === TASTER_TYPE);

  subsections = removeRecommendationEntry(subsections, key);
  if (sourceType === HALF_TYPE || sourceType === TASTER_TYPE) {
    compactNumberedCohort(cards, sourceType, key);
  }

  if (input.wantsArchived) {
    cards[key] = {
      ...current,
      catalogueType: targetType,
      taster: targetType === TASTER_TYPE,
      archived: true,
      archivedAt: current.archivedAt || String(input.now || new Date().toISOString())
    };
    delete cards[key].rank;
    return { cards, recommendationSubsections: subsections };
  }

  if (targetType === MAIN_TYPE) {
    subsections = moveRecommendationEntry(subsections, {
      key,
      targetSubsectionId: input.targetSubsectionId,
      targetPosition: input.targetPosition
    });
    cards[key] = {
      ...current,
      catalogueType: MAIN_TYPE,
      taster: false,
      archived: false,
      archivedAt: ''
    };
    delete cards[key].rank;
    return { cards, recommendationSubsections: subsections };
  }

  insertIntoNumberedCohort(cards, {
    key,
    type: targetType,
    position: input.targetPosition,
    card: {
      ...current,
      catalogueType: targetType,
      taster: targetType === TASTER_TYPE,
      archived: false,
      archivedAt: ''
    }
  });
  return { cards, recommendationSubsections: subsections };
}
