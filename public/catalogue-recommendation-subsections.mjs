import { ringGaugeForCard } from './catalogue-size-presentation.mjs';
import { registerCatalogueStateTransform, registerCatalogueStateResponseListener } from './catalogue-save-pipeline.mjs';

export const RECOMMENDATION_SUBSECTIONS = Object.freeze([
  { key: 'coronets', title: 'Coronets', description: '34 ring gauge or lower' },
  { key: 'petit-panatelas', title: 'Petit Panatelas', description: '35 ring gauge or higher' },
  { key: 'infused-flavoured', title: 'Infused / Flavoured', description: 'Infused and flavoured cigars' }
]);

const ROOT_ID = 'recommendation-format-subsections';
const STYLE_ID = 'catalogue-recommendation-subsections-style';
const STATE_API = '/api/catalogue-overrides';
const RANK_INPUT_ID = 'catalogue-admin-rank';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normaliseType(value, taster = false) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'half' || type === 'half-cigar' || type === 'halfcigar') return 'half';
  if (type === 'taster' || taster) return 'taster';
  return 'main';
}

export function recommendationSubsectionFor({ ring = 0, flavoured = false } = {}) {
  if (flavoured) return 'infused-flavoured';
  return finite(ring, 0) <= 34 ? 'coronets' : 'petit-panatelas';
}

export function rankRecommendationSubsections(rows = []) {
  const eligible = (Array.isArray(rows) ? rows : [])
    .filter(row => normaliseType(row.catalogueType, row.taster) === 'main' && !row.archived)
    .map(row => ({
      ...row,
      recommendationSubsection: row.recommendationSubsection || recommendationSubsectionFor(row)
    }));

  const ranks = new Map();
  for (const subsection of RECOMMENDATION_SUBSECTIONS) {
    eligible
      .filter(row => row.recommendationSubsection === subsection.key)
      .sort((a, b) => finite(a.recommendationRank, finite(a.rank, Number.MAX_SAFE_INTEGER)) - finite(b.recommendationRank, finite(b.rank, Number.MAX_SAFE_INTEGER)))
      .forEach((row, index) => ranks.set(row.key, index + 1));
  }

  return eligible.map(row => ({ ...row, subsectionRank: ranks.get(row.key) || 1 }));
}

function isFlavouredCard(card) {
  const text = Array.from(card?.querySelectorAll?.('.artmeta-left .artmeta-line') || [])
    .map(node => node.textContent || '')
    .join(' ');
  return /\b(?:flavou?red|infused)\b/i.test(text);
}

function cardType(card) {
  return normaliseType(card?.dataset?.catalogueType, card?.dataset?.taster === '1');
}

function isRecommendationTierCard(card) {
  if (!card || card.dataset?.archived === '1' || cardType(card) !== 'main') return false;
  return Boolean(card.closest?.('[data-tier-section="elite"], [data-tier-section="strong"]'))
    || Boolean(card.closest?.(`#${ROOT_ID}`));
}

function ensureStyle(root = document) {
  if (!root?.head || root.getElementById?.(STYLE_ID)) return;
  const style = root.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${ROOT_ID}{margin:0 0 28px}
#${ROOT_ID} .recommendation-format-group{margin:0 0 26px}
#${ROOT_ID} .recommendation-format-head{display:flex;align-items:baseline;gap:10px;margin:0 0 12px}
#${ROOT_ID} .recommendation-format-head h3{margin:0;font-size:18px}
#${ROOT_ID} .recommendation-format-head p{margin:0;opacity:.62;font-size:12px}
#${ROOT_ID} .recommendation-format-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:18px}
[data-tier-section="elite"].recommendation-format-hidden,
[data-tier-section="strong"].recommendation-format-hidden{display:none!important}
`;
  root.head.appendChild(style);
}

function ensureRoot(root = document) {
  let container = root.getElementById?.(ROOT_ID);
  if (container) return container;
  const elite = root.querySelector?.('[data-tier-section="elite"]');
  const strong = root.querySelector?.('[data-tier-section="strong"]');
  const anchor = elite || strong;
  if (!anchor?.parentElement) return null;
  container = root.createElement('div');
  container.id = ROOT_ID;
  container.className = 'recommendation-format-subsections';
  container.innerHTML = RECOMMENDATION_SUBSECTIONS.map(section => `
    <section class="recommendation-format-group" data-recommendation-subsection="${section.key}">
      <div class="recommendation-format-head"><h3>${section.title}</h3><p>${section.description}</p></div>
      <div class="recommendation-format-grid" data-recommendation-grid="${section.key}"></div>
    </section>`).join('');
  anchor.parentElement.insertBefore(container, anchor);
  return container;
}

function updateRankVisual(card, rank) {
  const value = Math.max(1, Math.round(finite(rank, 1)));
  card.dataset.recommendationRank = String(value);
  const rankflag = card.querySelector?.('.rankflag');
  const label = rankflag?.querySelector?.('span');
  const bold = rankflag?.querySelector?.('b');
  if (label) label.textContent = 'No.';
  if (bold) bold.textContent = String(value);
  const eyebrow = card.querySelector?.('.eyebrow');
  if (eyebrow) {
    const text = eyebrow.textContent || '';
    const tail = text.replace(/^\s*(?:No\.\s*)?(?:T|H)?\d+\s*[—-]\s*/i, '');
    eyebrow.textContent = `No. ${value} — ${tail}`;
  }
}

function cardRows(root = document) {
  return Array.from(root.querySelectorAll?.('article.card[data-key]') || [])
    .filter(isRecommendationTierCard)
    .map(card => ({
      key: card.dataset.key,
      rank: finite(card.dataset.globalRecommendationRank, finite(card.dataset.rank, 9999)),
      recommendationRank: finite(card.dataset.recommendationRank, 0) || undefined,
      ring: ringGaugeForCard(card),
      flavoured: isFlavouredCard(card),
      catalogueType: cardType(card),
      archived: card.dataset.archived === '1',
      card
    }));
}

function applyRanksAndGrouping(root = document) {
  const container = ensureRoot(root);
  if (!container) return 0;
  const ranked = rankRecommendationSubsections(cardRows(root));
  const byKey = new Map(ranked.map(row => [row.key, row]));

  for (const row of ranked) {
    const card = row.card;
    if (!card.dataset.globalRecommendationRank) card.dataset.globalRecommendationRank = card.dataset.rank || String(row.rank || 1);
    card.dataset.recommendationSubsection = row.recommendationSubsection;
    updateRankVisual(card, row.subsectionRank);
    const grid = container.querySelector(`[data-recommendation-grid="${row.recommendationSubsection}"]`);
    if (grid) grid.appendChild(card);
  }

  for (const subsection of RECOMMENDATION_SUBSECTIONS) {
    const group = container.querySelector(`[data-recommendation-subsection="${subsection.key}"]`);
    const grid = container.querySelector(`[data-recommendation-grid="${subsection.key}"]`);
    const cards = Array.from(grid?.querySelectorAll?.('article.card[data-key]') || [])
      .sort((a, b) => finite(a.dataset.recommendationRank, 9999) - finite(b.dataset.recommendationRank, 9999));
    cards.forEach(card => grid.appendChild(card));
    if (group) group.hidden = cards.length === 0;
  }

  root.querySelector?.('[data-tier-section="elite"]')?.classList.add('recommendation-format-hidden');
  root.querySelector?.('[data-tier-section="strong"]')?.classList.add('recommendation-format-hidden');
  return byKey.size;
}

export function syncRecommendationSubsections(root = document) {
  if (!root?.querySelectorAll) return 0;
  ensureStyle(root);
  return applyRanksAndGrouping(root);
}

function selectedCard(root = document) {
  const key = root.getElementById?.('catalogue-v139-key')?.value
    || root.getElementById?.('catalogue-admin-card')?.value
    || '';
  if (!key || key.startsWith('__')) return null;
  return Array.from(root.querySelectorAll?.('article.card[data-key]') || []).find(card => card.dataset.key === key) || null;
}

function syncEditorRank(root = document) {
  const card = selectedCard(root);
  const input = root.getElementById?.(RANK_INPUT_ID);
  if (!card || !input || !card.dataset.recommendationSubsection) return;
  input.value = card.dataset.recommendationRank || '1';
  const group = card.dataset.recommendationSubsection;
  const count = Array.from(root.querySelectorAll?.(`#${ROOT_ID} article.card[data-recommendation-subsection="${group}"]`) || []).length;
  input.max = String(Math.max(1, count));
}

async function hydrateSavedRanks(root = document) {
  try {
    const response = await fetch(`${STATE_API}?recommendation_subsections=1`, { cache: 'no-store' });
    if (!response.ok) return false;
    const state = await response.json();
    const cards = state?.cards && typeof state.cards === 'object' ? state.cards : {};
    root.querySelectorAll?.('article.card[data-key]').forEach(card => {
      const saved = cards[card.dataset.key];
      if (!saved) return;
      if (finite(saved.recommendationRank, 0) > 0) card.dataset.recommendationRank = String(Math.round(saved.recommendationRank));
    });
    syncRecommendationSubsections(root);
    syncEditorRank(root);
    return true;
  } catch (_) {
    return false;
  }
}

function patchRanks(payload, root = document) {
  if (!payload || typeof payload !== 'object' || !root?.querySelectorAll) return payload;
  const cards = payload.cards && typeof payload.cards === 'object' ? payload.cards : {};
  const updates = { ...cards };
  const rows = cardRows(root);
  const chosen = selectedCard(root);
  const rankInput = root.getElementById?.(RANK_INPUT_ID);

  for (const subsection of RECOMMENDATION_SUBSECTIONS) {
    const cohort = rows
      .filter(row => (row.card.dataset.recommendationSubsection || recommendationSubsectionFor(row)) === subsection.key)
      .sort((a, b) => finite(a.recommendationRank, finite(a.rank, 9999)) - finite(b.recommendationRank, finite(b.rank, 9999)));
    if (chosen?.dataset?.recommendationSubsection === subsection.key && rankInput) {
      const index = cohort.findIndex(row => row.key === chosen.dataset.key);
      if (index >= 0) {
        const [row] = cohort.splice(index, 1);
        const target = Math.max(0, Math.min(cohort.length, Math.round(finite(rankInput.value, 1)) - 1));
        cohort.splice(target, 0, row);
      }
    }
    cohort.forEach((row, index) => {
      updates[row.key] = {
        ...(updates[row.key] && typeof updates[row.key] === 'object' ? updates[row.key] : {}),
        rank: Math.max(1, Math.round(finite(row.card.dataset.globalRecommendationRank, row.rank || 1))),
        recommendationRank: index + 1
      };
    });
  }
  return { ...payload, cards: updates };
}

let refreshTimer = 0;
function scheduleSync(root = document) {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    syncRecommendationSubsections(root);
    syncEditorRank(root);
  }, 0);
}

export function installRecommendationSubsections(root = document) {
  if (typeof document === 'undefined' || !root) return;
  const start = () => {
    syncRecommendationSubsections(root);
    hydrateSavedRanks(root);
    registerCatalogueStateTransform('recommendation-subsections', 90, payload => patchRanks(payload, root));
    registerCatalogueStateResponseListener('recommendation-subsections', event => {
      if (event?.method === 'PUT') setTimeout(() => hydrateSavedRanks(root), 0);
    });
    root.getElementById?.('catalogue-admin-card')?.addEventListener('change', () => setTimeout(() => syncEditorRank(root), 0));
    root.getElementById?.('catalogue-admin-toggle')?.addEventListener('click', () => setTimeout(() => syncEditorRank(root), 0));
    if (typeof MutationObserver !== 'undefined' && root.body) {
      const observer = new MutationObserver(() => scheduleSync(root));
      observer.observe(root.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-rank', 'data-taster', 'data-catalogue-type', 'data-archived', 'data-visual-ring', 'data-recommendation-rank']
      });
    }
  };
  if (root.readyState === 'loading') root.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
}

if (typeof document !== 'undefined') installRecommendationSubsections(document);
