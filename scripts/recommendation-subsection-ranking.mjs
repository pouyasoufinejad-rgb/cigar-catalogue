import {
  normaliseSubsections,
  reconcileRecommendationSubsections,
  moveEntryToSubsection,
  removeEntryFromRecommendationSubsections,
  seedSubsectionForCard,
  syncRecommendationRanks
} from '../public/catalogue-recommendation-subsections.mjs';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord(value) {
  return isRecord(value) ? { ...value } : {};
}

function finiteRank(value, fallback = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.round(number) : fallback;
}

export function publisherCatalogueType(card = {}) {
  const explicit = String(card.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || Boolean(card.taster)) return 'taster';
  return 'main';
}

function applyType(card, type) {
  return { ...card, catalogueType: type, taster: type === 'taster' };
}

function ensureShape(state) {
  if (!isRecord(state.cards)) state.cards = {};
  if (!isRecord(state.sections)) state.sections = {};
  if (!isRecord(state.entries)) state.entries = {};
  return state;
}

function compactNonMain(state) {
  for (const type of ['half', 'taster']) {
    const cohort = Object.entries(state.cards)
      .filter(([, card]) => !card?.archived && publisherCatalogueType(card) === type)
      .sort((a, b) => finiteRank(a[1]?.rank) - finiteRank(b[1]?.rank));
    cohort.forEach(([key], index) => {
      state.cards[key] = applyType({ ...state.cards[key], rank: index + 1 }, type);
    });
  }
  return state;
}

function sectionForKey(state, key) {
  return normaliseSubsections(state.sections?.recommendationSubsections)
    .find(section => section.entryKeys.includes(key)) || null;
}

function validSectionId(state, id) {
  return normaliseSubsections(state.sections?.recommendationSubsections)
    .some(section => section.id === id);
}

function rowForSeed(key, card) {
  return { key, ...card };
}

export function normalisePublisherRankingState(stateInput, completeCards = null) {
  const state = ensureShape(stateInput);
  if (completeCards && isRecord(completeCards)) {
    state.cards = Object.fromEntries(Object.entries(completeCards).map(([key, card]) => [key, cloneRecord(card)]));
  }

  for (const [key, raw] of Object.entries(state.cards)) {
    let card = applyType(cloneRecord(raw), publisherCatalogueType(raw));
    if (card.archived) {
      if (!Number.isFinite(Number(card.archivedRank)) && Number.isFinite(Number(card.rank))) {
        card.archivedRank = finiteRank(card.rank, 1);
      }
      delete card.rank;
      delete card.subsection;
    }
    state.cards[key] = card;
  }

  state.sections.recommendationSubsections = normaliseSubsections(state.sections.recommendationSubsections);
  reconcileRecommendationSubsections(
    state,
    Object.entries(state.cards).map(([key, card]) => ({ key, ...card }))
  );
  compactNonMain(state);
  return state;
}

export function reorderPublisherTarget(stateInput, keyInput, targetCardInput, nowString) {
  const state = ensureShape(stateInput);
  const key = String(keyInput || '').trim();
  if (!key) return state;
  state.sections.recommendationSubsections = normaliseSubsections(state.sections.recommendationSubsections);

  const existing = cloneRecord(state.cards[key]);
  const targetCard = cloneRecord(targetCardInput);
  const oldType = publisherCatalogueType(existing);
  const targetType = publisherCatalogueType(targetCard);
  const oldSection = sectionForKey(state, key);
  const oldLocalRank = oldSection ? oldSection.entryKeys.indexOf(key) + 1 : finiteRank(existing.rank, 1);
  const oldGlobalRank = finiteRank(existing.rank, 1);
  const targetArchived = Boolean(targetCard.archived);

  if (targetArchived) {
    if (oldType === 'main') removeEntryFromRecommendationSubsections(state, key);
    const archived = applyType({
      ...existing,
      ...targetCard,
      archived: true,
      archivedAt: targetCard.archivedAt || existing.archivedAt || nowString,
      archivedRank: targetCard.archivedRank || existing.archivedRank || (oldType === 'main' ? oldLocalRank : oldGlobalRank)
    }, targetType);
    if (oldType === 'main' && oldSection) archived.archivedSubsection = oldSection.id;
    delete archived.rank;
    delete archived.subsection;
    state.cards[key] = archived;
    compactNonMain(state);
    syncRecommendationRanks(state);
    return state;
  }

  if (oldType === 'main' && targetType !== 'main') {
    removeEntryFromRecommendationSubsections(state, key);
  }

  if (targetType === 'main') {
    let subsectionId = String(targetCard.subsection || '').trim();
    if (!validSectionId(state, subsectionId)) subsectionId = oldType === 'main' && oldSection ? oldSection.id : '';
    if (!validSectionId(state, subsectionId)) subsectionId = String(existing.archivedSubsection || '').trim();
    if (!validSectionId(state, subsectionId)) subsectionId = seedSubsectionForCard(rowForSeed(key, { ...existing, ...targetCard }), state);

    const requested = finiteRank(
      targetCard.rank,
      finiteRank(targetCard.archivedRank, finiteRank(existing.archivedRank, Number.MAX_SAFE_INTEGER))
    );
    const destination = normaliseSubsections(state.sections.recommendationSubsections).find(section => section.id === subsectionId);
    const position = requested === Number.MAX_SAFE_INTEGER ? (destination?.entryKeys.length || 0) + 1 : requested;

    const main = applyType({ ...existing, ...targetCard, archived: false, archivedAt: '' }, 'main');
    delete main.archivedSubsection;
    delete main.subsection;
    state.cards[key] = main;
    moveEntryToSubsection(state, key, subsectionId, position);
    compactNonMain(state);
    return state;
  }

  const requestedRank = finiteRank(targetCard.rank, finiteRank(existing.archivedRank, finiteRank(existing.rank, 1)));
  state.cards[key] = applyType({ ...existing, ...targetCard, archived: false, archivedAt: '', rank: requestedRank }, targetType);
  const cohort = Object.entries(state.cards)
    .filter(([otherKey, card]) => otherKey !== key && !card?.archived && publisherCatalogueType(card) === targetType)
    .sort((a, b) => finiteRank(a[1]?.rank) - finiteRank(b[1]?.rank));
  const insertionIndex = Math.max(0, Math.min(cohort.length, requestedRank - 1));
  cohort.splice(insertionIndex, 0, [key, state.cards[key]]);
  cohort.forEach(([otherKey], index) => {
    state.cards[otherKey] = applyType({ ...state.cards[otherKey], rank: index + 1 }, targetType);
  });
  compactNonMain(state);
  syncRecommendationRanks(state);
  return state;
}

export function assertPublisherRankingInvariant(stateInput, label = 'Catalogue state') {
  const state = ensureShape(stateInput);
  const seen = new Set();
  const subsections = normaliseSubsections(state.sections.recommendationSubsections);

  for (const [key, card] of Object.entries(state.cards)) {
    if (card?.archived && Object.prototype.hasOwnProperty.call(card, 'rank')) {
      throw new Error(`${label} contains active rank on archived card "${key}".`);
    }
  }

  for (const section of subsections) {
    section.entryKeys.forEach((key, index) => {
      if (seen.has(key)) throw new Error(`${label} contains duplicate recommendation membership for "${key}".`);
      seen.add(key);
      const card = state.cards[key];
      if (!card || card.archived || publisherCatalogueType(card) !== 'main') {
        throw new Error(`${label} contains invalid recommendation member "${key}".`);
      }
      if (finiteRank(card.rank) !== index + 1 || card.subsection !== section.id) {
        throw new Error(`${label} has a gap, duplicate or stale mirror in subsection "${section.id}".`);
      }
    });
  }

  for (const [key, card] of Object.entries(state.cards)) {
    if (!card?.archived && publisherCatalogueType(card) === 'main' && !seen.has(key)) {
      throw new Error(`${label} is missing recommendation membership for "${key}".`);
    }
  }

  for (const type of ['half', 'taster']) {
    const ranks = Object.values(state.cards)
      .filter(card => !card?.archived && publisherCatalogueType(card) === type)
      .map(card => finiteRank(card.rank))
      .sort((a, b) => a - b);
    ranks.forEach((rank, index) => {
      if (rank !== index + 1) throw new Error(`${label} has a gap or duplicate in the ${type} rankings.`);
    });
  }
  return true;
}
