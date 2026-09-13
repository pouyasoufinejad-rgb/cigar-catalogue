import {
  registerCatalogueStateTransform,
  registerCatalogueStateResponseListener
} from './catalogue-save-pipeline.mjs';

const STATE_API = '/api/catalogue-overrides';
const COHORTS = ['coronets', 'petit-panatelas', 'flavoured'];
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

function positiveRank(value, fallback = Number.MAX_SAFE_INTEGER) {
  const number = Math.round(finite(value, fallback));
  return number >= 1 ? number : fallback;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

export function textLooksFlavoured(value) {
  return /\b(?:flavou?red|flavored|infused)\b/i.test(String(value || ''));
}

export function recommendationRankCohort({ recommendation = false, ring = 0, flavoured = false } = {}) {
  if (!recommendation) return '';
  if (flavoured) return 'flavoured';
  const gauge = finite(ring, 0);
  if (gauge <= 0) return '';
  return gauge <= 34 ? 'coronets' : 'petit-panatelas';
}

export function rankRecommendationRows(rows = [], { selectedKey = '', selectedRank = null } = {}) {
  const source = Array.isArray(rows) ? rows.filter(row => COHORTS.includes(row?.cohort)) : [];
  const output = {};

  for (const cohort of COHORTS) {
    const group = source
      .filter(row => row.cohort === cohort)
      .sort((a, b) => {
        const ar = positiveRank(a.recommendationRank, positiveRank(a.legacyRank));
        const br = positiveRank(b.recommendationRank, positiveRank(b.legacyRank));
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

function catalogueType(card, source = {}) {
  const explicit = String(source.catalogueType || card?.dataset?.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || source.taster === true || card?.dataset?.taster === '1') return 'taster';
  return 'main';
}

function scoreNode(card, label) {
  return Array.from(card?.querySelectorAll?.('.rating') || []).find(node =>
    node.querySelector?.(':scope > span')?.textContent?.trim().toLowerCase() === label
  ) || null;
}

function recommendationFromCard(card, source = {}) {
  if (own(source, 'strength') || own(source, 'quality')) {
    const strength = own(source, 'strength') ? finite(source.strength) : 0;
    const quality = own(source, 'quality') ? finite(source.quality) : 0;
    if (strength || quality) return strength >= 7 || quality >= 7;
  }
  return Boolean(scoreNode(card, 'strength')?.classList?.contains('gold') || scoreNode(card, 'quality')?.classList?.contains('gold'));
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

function flavouredFromCard(card, source = {}) {
  const sourceText = [
    ...(Array.isArray(source.productionLines) ? source.productionLines : []),
    source.productionHtml || '',
    source.title || '',
    source.eyebrow || ''
  ].join(' ');
  return textLooksFlavoured(sourceText) || textLooksFlavoured(card?.textContent || '');
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
  const recommendation = recommendationFromCard(card, source);
  const cohort = recommendationRankCohort({
    recommendation,
    ring: ringFromCard(card, source),
    flavoured: flavouredFromCard(card, source)
  });
  if (!cohort) return null;
  return {
    key,
    card,
    cohort,
    recommendationRank: positiveRank(source.recommendationRank, Number.MAX_SAFE_INTEGER),
    legacyRank: positiveRank(card?.dataset?.rank ?? source.rank, Number.MAX_SAFE_INTEGER)
  };
}

function recommendationRows(root = document, state = persistedState) {
  return Array.from(root?.querySelectorAll?.('article.card[data-key]') || [])
    .map(card => cardInfo(card, state))
    .filter(Boolean);
}

function removeIds(node) {
  if (!node?.querySelectorAll) return;
  node.removeAttribute?.('id');
  node.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
}

function setSectionCopy(section, cohort) {
  const meta = COHORT_META[cohort];
  if (!section || !meta) return;
  section.removeAttribute('data-tier-section');
  section.setAttribute('data-recommendation-cohort', cohort);
  section.classList?.remove?.('hidden');
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
  let flavoured = root.querySelector('[data-recommendation-cohort="flavoured"]');

  const elite = root.querySelector('[data-tier-section="elite"]');
  const strong = root.querySelector('[data-tier-section="strong"]');

  if (!coronets && elite) {
    coronets = elite;
    setSectionCopy(coronets, 'coronets');
  }
  if (!petits && strong) {
    petits = strong;
    setSectionCopy(petits, 'petit-panatelas');
  }

  if (!flavoured && petits?.parentElement) {
    flavoured = petits.cloneNode(true);
    removeIds(flavoured);
    flavoured.querySelectorAll?.('article.card').forEach(card => card.remove());
    setSectionCopy(flavoured, 'flavoured');
    petits.parentElement.insertBefore(flavoured, petits.nextSibling);
  }

  if (!coronets || !petits || !flavoured) return null;
  setSectionCopy(coronets, 'coronets');
  setSectionCopy(petits, 'petit-panatelas');
  setSectionCopy(flavoured, 'flavoured');

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
  if (input && String(input.value) !== String(rank)) input.value = String(rank);
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

    for (const cohort of COHORTS) {
      const grid = grids[cohort];
      if (!grid) continue;
      const group = rows
        .filter(row => row.cohort === cohort)
        .sort((a, b) => (ranked[a.key]?.rank || Number.MAX_SAFE_INTEGER) - (ranked[b.key]?.rank || Number.MAX_SAFE_INTEGER));
      group.forEach(row => {
        setRankVisual(row.card, ranked[row.key]?.rank);
        row.card.dataset.recommendationCohort = cohort;
        if (row.card.parentElement !== grid) grid.appendChild(row.card);
      });
      grids.sections[cohort]?.classList?.toggle?.('hidden', group.length === 0);
    }

    syncEditorRank(root, ranked);
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

function patchRecommendationRanks(payload, root = document) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const cards = source.cards && typeof source.cards === 'object' ? { ...source.cards } : {};
  const nextState = { ...source, cards };
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

  return nextState;
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
