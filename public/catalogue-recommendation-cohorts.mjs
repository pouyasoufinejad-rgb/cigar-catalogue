import {
  registerCatalogueStateTransform,
  registerCatalogueStateResponseListener
} from './catalogue-save-pipeline.mjs';

const STATE_API = '/api/catalogue-overrides';
const COHORTS = ['coronets', 'petit-panatelas', 'flavoured'];
const FLAVOURED_COHORT_EXCLUDED_KEYS = new Set(['kfc-ponies-sweets']);
const COHORT_META = Object.freeze({
  coronets: {
    title: 'Coronets',
    description: '34 ring gauge or lower.'
  },
  'petit-panatelas': {
    title: 'Petit Panatelas',
    description: '35 ring gauge or higher.'
  },
  flavoured: {
    title: 'Infused / Flavoured',
    description: 'Infused and flavoured recommendation cigars.'
  }
});

let persistedState = { cards: {}, entries: {} };
let refreshTimer = 0;
let refreshing = false;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalPositiveRank(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.round(number) : null;
}

function positiveRank(value, fallback = Number.MAX_SAFE_INTEGER) {
  return optionalPositiveRank(value) ?? fallback;
}

export function textLooksFlavoured(value) {
  return /\b(?:flavou?red|flavored|infused)\b/i.test(String(value || ''));
}

export function recommendationFlavourCohortEligible({ key = '', text = '' } = {}) {
  const normalisedKey = String(key || '').trim().toLowerCase();
  if (FLAVOURED_COHORT_EXCLUDED_KEYS.has(normalisedKey)) return false;
  return textLooksFlavoured(text);
}

export function recommendationRankCohort({ recommendation = false, ring = 0, flavoured = false } = {}) {
  if (!recommendation) return '';
  if (flavoured) return 'flavoured';
  const gauge = finite(ring, 0);
  if (gauge <= 0) return '';
  return gauge <= 34 ? 'coronets' : 'petit-panatelas';
}

export function recommendationCohortForMainCard({ key = '', ring = 0, text = '' } = {}) {
  return recommendationRankCohort({
    recommendation: true,
    ring,
    flavoured: recommendationFlavourCohortEligible({ key, text })
  });
}

function rowSortRank(row) {
  return optionalPositiveRank(row?.recommendationRank) ?? positiveRank(row?.legacyRank);
}

export function rankRecommendationRows(rows = [], { selectedKey = '', selectedRank = null } = {}) {
  const source = Array.isArray(rows) ? rows.filter(row => COHORTS.includes(row?.cohort)) : [];
  const output = {};

  for (const cohort of COHORTS) {
    const group = source
      .filter(row => row.cohort === cohort)
      .sort((a, b) => {
        const ar = rowSortRank(a);
        const br = rowSortRank(b);
        return ar - br || positiveRank(a.legacyRank) - positiveRank(b.legacyRank) || String(a.key).localeCompare(String(b.key));
      });

    const selectedIndex = selectedKey ? group.findIndex(row => row.key === selectedKey) : -1;
    if (selectedIndex >= 0 && selectedRank != null) {
      const [selected] = group.splice(selectedIndex, 1);
      const index = Math.max(0, Math.min(group.length, positiveRank(selectedRank, 1) - 1));
      group.splice(index, 0, selected);
    }

    group.forEach((row, index) => {
      output[row.key] = { cohort, rank: index + 1 };
    });
  }

  return output;
}

export function preserveGlobalRanksForRecommendationEdit(cardsInput = {}, ranksByKey = {}) {
  const cards = { ...(cardsInput && typeof cardsInput === 'object' ? cardsInput : {}) };
  for (const [key, rawRank] of Object.entries(ranksByKey && typeof ranksByKey === 'object' ? ranksByKey : {})) {
    const rank = optionalPositiveRank(rawRank);
    if (!rank) continue;
    cards[key] = {
      ...(cards[key] && typeof cards[key] === 'object' ? cards[key] : {}),
      rank
    };
  }
  return cards;
}

function catalogueType(card, source = {}) {
  const explicit = String(source.catalogueType || card?.dataset?.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || source.taster === true || card?.dataset?.taster === '1') return 'taster';
  return 'main';
}

function ringFromCard(card, source = {}) {
  const sourceRing = finite(source.ring, 0);
  if (sourceRing > 0) return sourceRing;
  const direct = finite(card?.dataset?.ring, 0);
  if (direct > 0) return direct;
  const visual = finite(card?.querySelector?.('.artframe[data-visual-ring]')?.dataset?.visualRing, 0);
  if (visual > 0) return visual;
  const match = String(card?.textContent || '').match(/\b(\d{1,2})\s*(?:RG|ring gauge)\b/i);
  return match ? finite(match[1], 0) : 0;
}

function flavourTextForCard(card, source = {}) {
  return [
    ...(Array.isArray(source.productionLines) ? source.productionLines : []),
    source.productionHtml || '',
    source.title || '',
    source.eyebrow || '',
    card?.textContent || ''
  ].join(' ');
}

function isUnavailable(card, source = {}) {
  if (source.archived === true || card?.dataset?.archived === '1') return true;
  const stock = String(source.stockPin || source.stock || card?.dataset?.stockPin || card?.dataset?.stock || '').trim().toLowerCase();
  return stock === 'out' || stock === 'delisted' || card?.classList?.contains?.('is-unavailable') || Boolean(card?.closest?.('.unavailable-grid'));
}

function mergedSourceForKey(key, state = persistedState) {
  const entry = state?.entries?.[key] && typeof state.entries[key] === 'object' ? state.entries[key] : {};
  const card = state?.cards?.[key] && typeof state.cards[key] === 'object' ? state.cards[key] : {};
  return { ...entry, ...card };
}

function cardInfo(card, state = persistedState) {
  const key = String(card?.dataset?.key || '').trim();
  if (!key) return null;
  const source = mergedSourceForKey(key, state);
  if (catalogueType(card, source) !== 'main' || isUnavailable(card, source)) return null;
  const cohort = recommendationCohortForMainCard({
    key,
    ring: ringFromCard(card, source),
    text: flavourTextForCard(card, source)
  });
  if (!cohort) return null;
  return {
    key,
    card,
    cohort,
    recommendationRank: optionalPositiveRank(source.recommendationRank),
    legacyRank: positiveRank(card?.dataset?.rank ?? source.rank)
  };
}

function recommendationRows(root = document, state = persistedState) {
  return Array.from(root?.querySelectorAll?.('article.card[data-key]') || [])
    .map(card => cardInfo(card, state))
    .filter(Boolean);
}

function setSectionCopy(section, cohort, { preserveExistingCopy = false } = {}) {
  const meta = COHORT_META[cohort];
  if (!section || !meta) return;
  section.setAttribute('data-recommendation-cohort', cohort);
  section.classList?.remove?.('hidden');
  if (preserveExistingCopy) return;
  const head = section.querySelector?.('.section-head') || section;
  const heading = head.querySelector?.('h2, h3');
  if (heading && heading.textContent !== meta.title) heading.textContent = meta.title;
  const description = head.querySelector?.('p');
  if (description && description.textContent !== meta.description) description.textContent = meta.description;
}

function ensureRecommendationSections(root = document) {
  if (!root?.querySelector) return null;
  let coronets = root.querySelector('[data-recommendation-cohort="coronets"]');
  let petits = root.querySelector('[data-recommendation-cohort="petit-panatelas"]');
  let flavoured = root.querySelector('[data-recommendation-cohort="flavoured"]')
    || root.querySelector('[data-noteworthy-section="neither"]');

  const elite = root.querySelector('[data-tier-section="elite"]');
  const strong = root.querySelector('[data-tier-section="strong"]');

  if (!coronets && elite) coronets = elite;
  if (!petits && strong) petits = strong;

  if (!coronets || !petits || !flavoured) return null;
  setSectionCopy(coronets, 'coronets');
  setSectionCopy(petits, 'petit-panatelas');
  setSectionCopy(flavoured, 'flavoured', { preserveExistingCopy: true });

  return {
    coronets: coronets.querySelector('.grid'),
    'petit-panatelas': petits.querySelector('.grid'),
    flavoured: flavoured.querySelector('.grid'),
    sections: { coronets, 'petit-panatelas': petits, flavoured }
  };
}

function setRankVisual(card, rank) {
  if (!card || !Number.isFinite(rank)) return;
  const next = String(rank);
  if (card.dataset.recommendationRank !== next) card.dataset.recommendationRank = next;
  const rankflag = card.querySelector?.('.rankflag');
  const label = rankflag?.querySelector?.('span');
  const value = rankflag?.querySelector?.('b');
  if (label && label.textContent !== 'No.') label.textContent = 'No.';
  if (value && value.textContent !== next) value.textContent = next;
}

function selectedEditorKey(root = document) {
  const select = root?.getElementById?.('catalogue-admin-card') || root?.querySelector?.('#catalogue-admin-card');
  const value = String(select?.value || '').trim();
  return value && !value.startsWith('__v139_') ? value : '';
}

function desiredEditorRank(root = document) {
  const input = root?.getElementById?.('catalogue-admin-rank') || root?.querySelector?.('#catalogue-admin-rank');
  const value = Number(input?.value);
  return Number.isFinite(value) && value >= 1 ? Math.round(value) : null;
}

function cardByKey(root, key) {
  return Array.from(root?.querySelectorAll?.('article.card[data-key]') || []).find(card => card.dataset.key === key) || null;
}

function syncEditorRank(root = document, ranked = null) {
  const key = selectedEditorKey(root);
  if (!key) return;
  const map = ranked || Object.fromEntries(
    Array.from(root?.querySelectorAll?.('article.card[data-key][data-recommendation-rank]') || []).map(card => [card.dataset.key, {
      rank: positiveRank(card.dataset.recommendationRank, 0)
    }])
  );
  const rank = map[key]?.rank;
  if (!rank) return;
  const input = root?.getElementById?.('catalogue-admin-rank') || root?.querySelector?.('#catalogue-admin-rank');
  if (!input) return;
  if (String(input.value) !== String(rank)) input.value = String(rank);
  const card = cardByKey(root, key);
  const cohort = card?.dataset?.recommendationCohort || map[key]?.cohort || '';
  if (cohort) {
    const count = Array.from(root.querySelectorAll('article.card[data-key]'))
      .filter(node => node.dataset.recommendationCohort === cohort).length;
    if (count) input.max = String(count);
  }
}

function refreshLegacyGroupVisibility() {
  const refresh = globalThis?.window?.refreshGroupVisibility;
  if (typeof refresh === 'function') refresh();
}

export function refreshRecommendationCohorts(root = document, state = persistedState, options = {}) {
  if (!root?.querySelectorAll || refreshing) return 0;
  const grids = ensureRecommendationSections(root);
  if (!grids) return 0;

  refreshing = true;
  try {
    const rows = recommendationRows(root, state);
    const ranked = rankRecommendationRows(rows, {
      selectedKey: options.selectedKey || '',
      selectedRank: options.selectedRank ?? null
    });
    const activeKeys = new Set(rows.map(row => row.key));

    root.querySelectorAll('article.card[data-key][data-recommendation-cohort]').forEach(card => {
      if (activeKeys.has(card.dataset.key)) return;
      delete card.dataset.recommendationCohort;
      delete card.dataset.recommendationRank;
    });

    for (const cohort of COHORTS) {
      const grid = grids[cohort];
      if (!grid) continue;
      const group = rows
        .filter(row => row.cohort === cohort)
        .sort((a, b) => (ranked[a.key]?.rank || Number.MAX_SAFE_INTEGER) - (ranked[b.key]?.rank || Number.MAX_SAFE_INTEGER));
      group.forEach(row => {
        row.card.dataset.recommendationCohort = cohort;
        setRankVisual(row.card, ranked[row.key]?.rank);
        if (row.card.parentElement !== grid) grid.appendChild(row.card);
      });
      grids.sections[cohort]?.classList?.toggle?.('hidden', group.length === 0);
    }

    syncEditorRank(root, ranked);
    refreshLegacyGroupVisibility();
    return rows.length;
  } finally {
    refreshing = false;
  }
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    refreshRecommendationCohorts(document);
  }, 0);
}

function activeMainGlobalRanks(root = document) {
  const ranks = {};
  Array.from(root?.querySelectorAll?.('article.card[data-key]') || []).forEach(card => {
    if (card.dataset.archived === '1' || catalogueType(card) !== 'main') return;
    const rank = optionalPositiveRank(card.dataset.rank);
    if (rank) ranks[card.dataset.key] = rank;
  });
  return ranks;
}

function selectedUsesLocalRecommendationRank(root, state) {
  const key = selectedEditorKey(root);
  const card = key ? cardByKey(root, key) : null;
  if (!card?.dataset?.recommendationCohort || card.dataset.archived === '1') return false;
  const source = mergedSourceForKey(key, state);
  return catalogueType(card, source) === 'main' && source.archived !== true;
}

function patchRecommendationRanks(payload, root = document) {
  const source = payload && typeof payload === 'object' ? payload : {};
  let cards = source.cards && typeof source.cards === 'object' ? { ...source.cards } : {};
  let nextState = { ...source, cards };

  if (selectedUsesLocalRecommendationRank(root, nextState)) {
    cards = preserveGlobalRanksForRecommendationEdit(cards, activeMainGlobalRanks(root));
    nextState = { ...nextState, cards };
  }

  const rows = recommendationRows(root, nextState);
  const selectedKey = selectedEditorKey(root);
  const selectedRank = selectedKey && rows.some(row => row.key === selectedKey) ? desiredEditorRank(root) : null;
  const ranked = rankRecommendationRows(rows, { selectedKey, selectedRank });

  for (const row of rows) {
    cards[row.key] = {
      ...(cards[row.key] && typeof cards[row.key] === 'object' ? cards[row.key] : {}),
      recommendationCohort: ranked[row.key].cohort,
      recommendationRank: ranked[row.key].rank
    };
  }

  return { ...nextState, cards };
}

function acceptState(state) {
  if (!state || typeof state !== 'object') return;
  persistedState = {
    cards: state.cards && typeof state.cards === 'object' ? state.cards : {},
    entries: state.entries && typeof state.entries === 'object' ? state.entries : {}
  };
  scheduleRefresh();
}

export function installRecommendationCohorts() {
  if (typeof document === 'undefined') return;

  registerCatalogueStateTransform('recommendation-subsection-ranks', 30, payload => patchRecommendationRanks(payload, document));
  registerCatalogueStateResponseListener('recommendation-subsection-ranks', event => acceptState(event?.state));

  const start = () => {
    refreshRecommendationCohorts(document);
    document.getElementById('catalogue-admin-card')?.addEventListener('change', () => setTimeout(scheduleRefresh, 0));
    document.getElementById('catalogue-admin-rank')?.addEventListener('change', scheduleRefresh);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      const observer = new MutationObserver(scheduleRefresh);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'class', 'data-rank', 'data-stock', 'data-stock-pin', 'data-archived', 'data-taster',
          'data-catalogue-type', 'data-visual-ring', 'data-key'
        ]
      });
    }
    fetch(`${STATE_API}?recommendation_cohorts=1`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(acceptState)
      .catch(() => {});
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

if (typeof document !== 'undefined') installRecommendationCohorts();

export { COHORTS, COHORT_META };
