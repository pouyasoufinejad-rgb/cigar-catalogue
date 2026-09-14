import {
  registerCatalogueStateResponseListener,
  registerCatalogueStateTransform
} from './catalogue-save-pipeline.mjs';
import { validateRecommendationSubsectionsShape } from './catalogue-structure.mjs';
import { buildLegacyRecommendationSubsections } from './catalogue-recommendation-legacy.mjs';

const STATE_API = '/api/catalogue-overrides';
const ROOT_ATTRIBUTE = 'data-recommendation-subsections-root';
const STYLE_ID = 'catalogue-recommendation-subsections-style-v7';
const RANK_CLEANUP_TRANSFORM = 'recommendation-v4-rank-cleanup';
let persistedState = { version: 3, cards: {}, entries: {} };
let refreshTimer = 0;
let refreshing = false;
let initialStateAccepted = false;
let resetTopAfterRefresh = false;

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

export function stripLegacyRecommendationRanks(payload = {}) {
  if (Number(payload?.version) < 4 || !Array.isArray(payload?.recommendationSubsections)) return payload;
  const subsections = validateRecommendationSubsectionsShape(payload.recommendationSubsections);
  const cards = payload?.cards && typeof payload.cards === 'object' ? payload.cards : {};
  let nextCards = cards;
  let changed = false;

  for (const subsection of subsections) {
    for (const key of subsection.entryKeys) {
      const card = cards[key];
      if (!card || typeof card !== 'object' || !Object.prototype.hasOwnProperty.call(card, 'rank')) continue;
      if (!changed) nextCards = { ...cards };
      nextCards[key] = { ...card };
      delete nextCards[key].rank;
      changed = true;
    }
  }

  return changed ? { ...payload, cards: nextCards } : payload;
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

function cardUnavailable(card, source = {}) {
  const stock = String(source.stockPin || source.stock || card?.dataset?.stockPin || card?.dataset?.stock || '').trim().toLowerCase();
  return stock === 'out'
    || stock === 'delisted'
    || card?.classList?.contains?.('is-unavailable')
    || Boolean(card?.closest?.('.unavailable-grid'));
}

function cardVisibleInCurrentView(card, source = {}) {
  if (cardUnavailable(card, source)) return false;
  if (card?.classList?.contains?.('hidden')) return false;
  if (card?.dataset?.personalFilterHidden === '1') return false;
  return true;
}

function documentFor(root) {
  if (root?.createElement) return root;
  return root?.ownerDocument || globalThis.document || null;
}

function ensureStyles(doc) {
  if (!doc?.createElement || doc.getElementById?.(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.recommendation-subsections{margin:18px 0 4px}
.recommendation-subsections.hidden{display:none!important}
.recommendation-subsection{margin-top:34px}
.recommendation-subsection:first-child{margin-top:10px}
.recommendation-subsection.hidden{display:none!important}
.recommendation-subsection-grid{margin-top:0}
@media(max-width:700px){
  .recommendation-subsections{margin-top:14px}
  .recommendation-subsection{margin-top:28px}
}`;
  (doc.head || doc.documentElement)?.appendChild?.(style);
}

function ensureRoot(root = document) {
  const doc = documentFor(root);
  if (!doc?.createElement) return null;
  ensureStyles(doc);

  const tierStack = root?.querySelector?.('#cards');
  let mount = root?.querySelector?.(`[${ROOT_ATTRIBUTE}]`);
  if (!mount) {
    mount = doc.createElement('div');
    mount.setAttribute(ROOT_ATTRIBUTE, '1');
    mount.className = 'recommendation-subsections';
  }

  if (tierStack?.parentElement?.insertBefore) {
    if (mount.parentElement !== tierStack.parentElement || mount.nextElementSibling !== tierStack) {
      tierStack.parentElement.insertBefore(mount, tierStack);
    }
    return mount;
  }

  if (!mount.parentElement) {
    const parent = root?.querySelector?.('main') || root?.body || root?.documentElement || root;
    parent?.appendChild?.(mount);
  }
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
    head.className = 'section-head recommendation-subsection-head';
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
  const heading = section.querySelector?.('.recommendation-subsection-head h2');
  const description = section.querySelector?.('.recommendation-subsection-head p');
  if (heading) heading.textContent = subsection.name;
  if (description) {
    description.textContent = subsection.description;
    description.classList?.toggle?.('hidden', !String(subsection.description || '').trim());
  }
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

function sortControlFor(root) {
  return root?.getElementById?.('sort') || root?.querySelector?.('#sort') || null;
}

export function renderRecommendationSubsections(state = persistedState, root = document) {
  if (!root?.querySelectorAll || refreshing) return 0;
  const rows = rowsFromDomAndState(root, state);
  const subsections = recommendationSubsectionsForState(state, rows);
  const mount = ensureRoot(root);
  if (!mount) return 0;

  const activeKeys = new Set(subsections.flatMap(section => section.entryKeys));
  const sortControl = sortControlFor(root);
  if (sortControl?.value && sortControl.value !== 'rank') {
    mount.classList?.add?.('hidden');
    refreshLegacyGroupVisibility();
    return activeKeys.size;
  }

  refreshing = true;
  try {
    mount.classList?.remove?.('hidden');
    const cardMap = cardsByKey(root);
    clearStaleRecommendationData(root, activeKeys);

    const desiredIds = new Set(subsections.map(section => section.id));
    Array.from(mount.querySelectorAll?.('[data-recommendation-subsection]') || []).forEach(section => {
      const id = section.getAttribute?.('data-recommendation-subsection');
      if (!desiredIds.has(id)) section.remove?.();
    });

    let visibleTotal = 0;
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
        if (!cardUnavailable(card, source) && grid && card.parentElement !== grid) grid.appendChild(card);
        if (cardVisibleInCurrentView(card, source)) visible += 1;
      });
      visibleTotal += visible;
      section.classList?.toggle?.('hidden', visible === 0);
    });

    mount.classList?.toggle?.('hidden', visibleTotal === 0);
    refreshLegacyGroupVisibility();
    return activeKeys.size;
  } finally {
    refreshing = false;
  }
}

function canResetInitialScroll(target = globalThis?.window) {
  return Boolean(target && !String(target.location?.hash || ''));
}

function prepareInitialScrollReset(target = globalThis?.window) {
  if (!canResetInitialScroll(target)) return false;
  try {
    if (target.history && 'scrollRestoration' in target.history) target.history.scrollRestoration = 'manual';
  } catch (_) {}
  return true;
}

function restoreInitialTop(target = globalThis?.window) {
  if (!canResetInitialScroll(target) || typeof target.scrollTo !== 'function') return false;
  target.scrollTo(0, 0);
  if (typeof target.requestAnimationFrame === 'function') {
    target.requestAnimationFrame(() => target.requestAnimationFrame(() => target.scrollTo(0, 0)));
  }
  return true;
}

function scheduleRefresh(resetInitialTop = false) {
  if (resetInitialTop) resetTopAfterRefresh = true;
  if (refreshTimer || typeof document === 'undefined') return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    renderRecommendationSubsections(persistedState, document);
    if (resetTopAfterRefresh) {
      resetTopAfterRefresh = false;
      restoreInitialTop(globalThis?.window);
    }
  }, 0);
}

function acceptState(state) {
  if (!state || typeof state !== 'object') return;
  const firstState = !initialStateAccepted;
  initialStateAccepted = true;
  persistedState = {
    version: Number(state.version) || 3,
    cards: state.cards && typeof state.cards === 'object' ? state.cards : {},
    entries: state.entries && typeof state.entries === 'object' ? state.entries : {},
    ...(Array.isArray(state.recommendationSubsections)
      ? { recommendationSubsections: state.recommendationSubsections }
      : {})
  };
  scheduleRefresh(firstState);
}

function installControlRefreshHooks() {
  const sort = document.getElementById?.('sort');
  const secondary = document.getElementById?.('sort-secondary');
  sort?.addEventListener?.('change', scheduleRefresh);
  secondary?.addEventListener?.('change', scheduleRefresh);
  Array.from(document.querySelectorAll?.('.toggle button') || []).forEach(button => {
    button.addEventListener?.('click', scheduleRefresh);
  });
}

export function installRecommendationSubsections() {
  if (typeof document === 'undefined') return;
  prepareInitialScrollReset(globalThis?.window);
  registerCatalogueStateTransform(RANK_CLEANUP_TRANSFORM, 95, payload => stripLegacyRecommendationRanks(payload));
  registerCatalogueStateResponseListener('recommendation-subsections', event => acceptState(event?.state));

  const start = () => {
    installControlRefreshHooks();
    renderRecommendationSubsections(persistedState, document);
    fetch(`${STATE_API}?recommendation_subsections=1`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(acceptState)
      .catch(() => {});
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

if (typeof document !== 'undefined') installRecommendationSubsections();