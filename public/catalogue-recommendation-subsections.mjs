import { registerCatalogueStateResponseListener } from './catalogue-save-pipeline.mjs';
import { validateRecommendationSubsectionsShape } from './catalogue-structure.mjs';
import { buildLegacyRecommendationSubsections } from './catalogue-recommendation-legacy.mjs';

const STATE_API = '/api/catalogue-overrides';
const ROOT_ATTRIBUTE = 'data-recommendation-subsections-root';
let persistedState = { version: 3, cards: {}, entries: {} };
let refreshTimer = 0;
let refreshing = false;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function catalogueType(card, source = {}) {
  const explicit = String(source.catalogueType || card?.dataset?.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || source.taster === true || card?.dataset?.taster === '1') return 'taster';
  return 'main';
}

function mergedSourceForKey(key, state = persistedState) {
  const entry = state?.entries?.[key] && typeof state.entries[key] === 'object' ? state.entries[key] : {};
  const card = state?.cards?.[key] && typeof state.cards[key] === 'object' ? state.cards[key] : {};
  return { ...entry, ...card };
}

function ringFromCard(card, source = {}) {
  const stored = finite(source.ring, 0);
  if (stored > 0) return stored;
  const direct = finite(card?.dataset?.ring, 0);
  if (direct > 0) return direct;
  const visual = finite(card?.querySelector?.('.artframe[data-visual-ring]')?.dataset?.visualRing, 0);
  if (visual > 0) return visual;
  const match = String(card?.textContent || '').match(/\b(\d{1,2})\s*(?:RG|ring gauge)\b/i);
  return match ? finite(match[1], 0) : 0;
}

function productionTextForCard(card, source = {}) {
  const stored = [
    ...(Array.isArray(source.productionLines) ? source.productionLines : []),
    source.productionHtml || ''
  ].join(' ').trim();
  return stored || String(card?.querySelector?.('.artmeta-left')?.textContent || '');
}

function legacyRowForCard(card, state = persistedState) {
  const key = String(card?.dataset?.key || '').trim();
  if (!key) return null;
  const source = mergedSourceForKey(key, state);
  return {
    key,
    catalogueType: catalogueType(card, source),
    taster: source.taster === true || card?.dataset?.taster === '1',
    archived: source.archived === true || card?.dataset?.archived === '1',
    ring: ringFromCard(card, source),
    productionText: productionTextForCard(card, source),
    flavoured: typeof source.flavoured === 'boolean' ? source.flavoured : undefined,
    infused: typeof source.infused === 'boolean' ? source.infused : undefined,
    recommendationCohort: source.recommendationCohort || '',
    recommendationRank: source.recommendationRank,
    legacyRank: card?.dataset?.rank ?? source.rank
  };
}

export function rowsFromDomAndState(root = document, state = persistedState) {
  return Array.from(root?.querySelectorAll?.('article.card[data-key]') || [])
    .map(card => legacyRowForCard(card, state))
    .filter(Boolean);
}

export function recommendationSubsectionsForState(state = {}, legacyRows = []) {
  if (Number(state?.version) >= 4 && Array.isArray(state?.recommendationSubsections)) {
    return validateRecommendationSubsectionsShape(state.recommendationSubsections);
  }
  return buildLegacyRecommendationSubsections(legacyRows);
}

export function updateRecommendationRankVisual(card, rankInput) {
  const rank = Number(rankInput);
  if (!card || !Number.isInteger(rank) || rank < 1) return;
  const next = String(rank);
  if (card.dataset && card.dataset.recommendationRank !== next) card.dataset.recommendationRank = next;
  const flag = card.querySelector?.('.rankflag');
  const label = flag?.querySelector?.('span');
  const value = flag?.querySelector?.('b');
  if (label && label.textContent !== 'No.') label.textContent = 'No.';
  if (value && value.textContent !== next) value.textContent = next;
}

function effectiveStockStatus(card, source = {}) {
  const pin = String(source.stockPin ?? card?.dataset?.stockPin ?? '').trim().toLowerCase();
  if (pin === 'in' || pin === 'out' || pin === 'hold') return pin;
  return String(source.stock ?? card?.dataset?.stock ?? 'unknown').trim().toLowerCase() || 'unknown';
}

export function recommendationCardUnavailable(card, source = {}) {
  const stock = effectiveStockStatus(card, source);
  return stock === 'out' || stock === 'delisted';
}

export function prepareRecommendationCardForActiveGrid(card) {
  card?.classList?.remove?.('hidden', 'is-unavailable');
  return card;
}

function documentFor(root) {
  if (root?.createElement) return root;
  return root?.ownerDocument || globalThis.document || null;
}

function ensureRoot(root = document) {
  const existing = root?.querySelector?.(`[${ROOT_ATTRIBUTE}]`);
  if (existing) return existing;
  const doc = documentFor(root);
  if (!doc?.createElement) return null;

  const mount = doc.createElement('div');
  mount.setAttribute(ROOT_ATTRIBUTE, '1');
  mount.className = 'recommendation-subsections';

  const firstCard = root?.querySelector?.('article.card[data-key]');
  const firstSection = firstCard?.closest?.('section');
  if (firstSection?.parentElement?.insertBefore) {
    firstSection.parentElement.insertBefore(mount, firstSection);
    return mount;
  }

  const parent = root?.querySelector?.('main') || root?.body || root?.documentElement || root;
  parent?.appendChild?.(mount);
  return mount;
}

function ensureSubsectionNode(mount, subsection) {
  const doc = documentFor(mount);
  if (!doc?.createElement) return null;
  let section = Array.from(mount?.querySelectorAll?.('[data-recommendation-subsection]') || [])
    .find(node => node.getAttribute?.('data-recommendation-subsection') === subsection.id);
  if (!section) {
    section = doc.createElement('section');
    section.className = 'recommendation-subsection';
    section.setAttribute('data-recommendation-subsection', subsection.id);
    const head = doc.createElement('div');
    head.className = 'section-head';
    const heading = doc.createElement('h2');
    const description = doc.createElement('p');
    const grid = doc.createElement('div');
    grid.className = 'grid recommendation-subsection-grid';
    grid.id = `recommendation-subsection-${subsection.id}-cards`;
    head.appendChild(heading);
    head.appendChild(description);
    section.appendChild(head);
    section.appendChild(grid);
  }
  const heading = section.querySelector?.('.section-head h2');
  const description = section.querySelector?.('.section-head p');
  if (heading) heading.textContent = subsection.name;
  if (description) description.textContent = subsection.description;
  return section;
}

function cardsByKey(root) {
  const map = new Map();
  Array.from(root?.querySelectorAll?.('article.card[data-key]') || []).forEach(card => {
    const key = String(card?.dataset?.key || '').trim();
    if (key && !map.has(key)) map.set(key, card);
  });
  return map;
}

function clearStaleRecommendationData(root, activeKeys) {
  Array.from(root?.querySelectorAll?.('article.card[data-key]') || []).forEach(card => {
    const key = String(card?.dataset?.key || '').trim();
    if (activeKeys.has(key)) return;
    if (card.dataset) {
      delete card.dataset.recommendationSubsection;
      delete card.dataset.recommendationRank;
      delete card.dataset.recommendationCohort;
    }
  });
}

function refreshLegacyGroupVisibility() {
  const refresh = globalThis?.window?.refreshGroupVisibility;
  if (typeof refresh === 'function') refresh();
}

export function renderRecommendationSubsections(state = persistedState, root = document) {
  if (!root?.querySelectorAll || refreshing) return 0;
  const rows = rowsFromDomAndState(root, state);
  const subsections = recommendationSubsectionsForState(state, rows);
  const mount = ensureRoot(root);
  if (!mount) return 0;

  refreshing = true;
  try {
    const cardMap = cardsByKey(root);
    const activeKeys = new Set(subsections.flatMap(section => section.entryKeys));
    clearStaleRecommendationData(root, activeKeys);

    const desiredIds = new Set(subsections.map(section => section.id));
    Array.from(mount.querySelectorAll?.('[data-recommendation-subsection]') || []).forEach(section => {
      const id = section.getAttribute?.('data-recommendation-subsection');
      if (!desiredIds.has(id)) section.remove?.();
    });

    subsections.forEach(subsection => {
      const section = ensureSubsectionNode(mount, subsection);
      if (!section) return;
      mount.appendChild(section);
      const grid = section.querySelector?.('.recommendation-subsection-grid');
      let visible = 0;
      subsection.entryKeys.forEach((key, index) => {
        const card = cardMap.get(key);
        if (!card) return;
        const source = mergedSourceForKey(key, state);
        if (catalogueType(card, source) !== 'main' || source.archived === true || card?.dataset?.archived === '1') return;
        if (card.dataset) {
          card.dataset.recommendationSubsection = subsection.id;
          delete card.dataset.recommendationCohort;
        }
        updateRecommendationRankVisual(card, index + 1);
        const unavailable = recommendationCardUnavailable(card, source);
        if (!unavailable && grid && card.parentElement !== grid) {
          prepareRecommendationCardForActiveGrid(card);
          grid.appendChild(card);
        }
        if (!unavailable) visible += 1;
      });
      section.classList?.toggle?.('hidden', visible === 0);
    });

    refreshLegacyGroupVisibility();
    return activeKeys.size;
  } finally {
    refreshing = false;
  }
}

function scheduleRefresh() {
  if (refreshTimer || typeof document === 'undefined') return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    renderRecommendationSubsections(persistedState, document);
  }, 0);
}

function acceptState(state) {
  if (!state || typeof state !== 'object') return;
  persistedState = {
    version: Number(state.version) || 3,
    cards: state.cards && typeof state.cards === 'object' ? state.cards : {},
    entries: state.entries && typeof state.entries === 'object' ? state.entries : {},
    ...(Array.isArray(state.recommendationSubsections)
      ? { recommendationSubsections: state.recommendationSubsections }
      : {})
  };
  scheduleRefresh();
}

export function installRecommendationSubsections() {
  if (typeof document === 'undefined') return;
  registerCatalogueStateResponseListener('recommendation-subsections', event => acceptState(event?.state));

  const start = () => {
    renderRecommendationSubsections(persistedState, document);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      const observer = new MutationObserver(scheduleRefresh);
      observer.observe(document.body, { subtree: true, childList: true });
    }
    fetch(`${STATE_API}?recommendation_subsections=1`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(acceptState)
      .catch(() => {});
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

if (typeof document !== 'undefined') installRecommendationSubsections();