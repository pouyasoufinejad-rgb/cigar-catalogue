import { ringGaugeForCard } from './catalogue-size-presentation.mjs';
import { registerCatalogueStateTransform } from './catalogue-save-pipeline.mjs';

export const RECOMMENDATION_SUBSECTIONS = Object.freeze([
  { key: 'coronets', title: 'Coronets', description: '34 ring gauge or lower' },
  { key: 'petit-panatelas', title: 'Petit Panatelas', description: '35 ring gauge or higher' },
  { key: 'infused-flavoured', title: 'Infused / Flavoured', description: 'Infused and flavoured cigars' }
]);

const ROOT_ID = 'recommendation-format-subsections';
const STYLE_ID = 'catalogue-recommendation-subsections-style';

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
      .sort((a, b) => finite(a.rank, Number.MAX_SAFE_INTEGER) - finite(b.rank, Number.MAX_SAFE_INTEGER))
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

function classifyCard(card) {
  return recommendationSubsectionFor({
    ring: ringGaugeForCard(card),
    flavoured: isFlavouredCard(card)
  });
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
  card.dataset.rank = String(value);
  const rankflag = card.querySelector?.('.rankflag');
  const label = rankflag?.querySelector?.('span');
  const bold = rankflag?.querySelector?.('b');
  if (label) label.textContent = 'No.';
  if (bold) bold.textContent = String(value);
  const eyebrow = card.querySelector?.('.eyebrow');
  if (eyebrow) {
    const text = eyebrow.textContent || '';
    eyebrow.textContent = /^\s*No\.\s*\d+\s*[—-]\s*/i.test(text)
      ? text.replace(/^\s*No\.\s*\d+\s*[—-]\s*/i, `No. ${value} — `)
      : `No. ${value} — ${text.replace(/^\s*(?:T|H)?\d+\s*[—-]\s*/i, '')}`;
  }
}

export function syncRecommendationSubsections(root = document) {
  if (!root?.querySelectorAll) return 0;
  ensureStyle(root);
  const container = ensureRoot(root);
  if (!container) return 0;

  const cards = Array.from(root.querySelectorAll('article.card[data-key]')).filter(isRecommendationTierCard);
  const rows = cards.map(card => ({
    key: card.dataset.key,
    rank: finite(card.dataset.rank, 9999),
    ring: ringGaugeForCard(card),
    flavoured: isFlavouredCard(card),
    catalogueType: cardType(card),
    archived: card.dataset.archived === '1'
  }));
  const ranked = rankRecommendationSubsections(rows);
  const byKey = new Map(ranked.map(row => [row.key, row]));

  for (const card of cards) {
    const row = byKey.get(card.dataset.key);
    if (!row) continue;
    card.dataset.recommendationSubsection = row.recommendationSubsection;
    updateRankVisual(card, row.subsectionRank);
    const grid = container.querySelector(`[data-recommendation-grid="${row.recommendationSubsection}"]`);
    if (grid && card.parentElement !== grid) grid.appendChild(card);
  }

  RECOMMENDATION_SUBSECTIONS.forEach(section => {
    const group = container.querySelector(`[data-recommendation-subsection="${section.key}"]`);
    const count = group?.querySelectorAll?.('article.card[data-key]')?.length || 0;
    if (group) group.hidden = count === 0;
  });
  root.querySelector?.('[data-tier-section="elite"]')?.classList.add('recommendation-format-hidden');
  root.querySelector?.('[data-tier-section="strong"]')?.classList.add('recommendation-format-hidden');
  return cards.length;
}

function patchRanks(payload, root = document) {
  if (!payload || typeof payload !== 'object' || !root?.querySelectorAll) return payload;
  const cards = payload.cards && typeof payload.cards === 'object' ? payload.cards : {};
  const updates = { ...cards };
  Array.from(root.querySelectorAll(`#${ROOT_ID} article.card[data-key]`)).forEach(card => {
    updates[card.dataset.key] = {
      ...(updates[card.dataset.key] && typeof updates[card.dataset.key] === 'object' ? updates[card.dataset.key] : {}),
      rank: Math.max(1, Math.round(finite(card.dataset.rank, 1)))
    };
  });
  return { ...payload, cards: updates };
}

let refreshTimer = 0;
function scheduleSync(root = document) {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    syncRecommendationSubsections(root);
  }, 0);
}

export function installRecommendationSubsections(root = document) {
  if (typeof document === 'undefined' || !root) return;
  const start = () => {
    syncRecommendationSubsections(root);
    registerCatalogueStateTransform('recommendation-subsections', 35, payload => patchRanks(payload, root));
    if (typeof MutationObserver !== 'undefined' && root.body) {
      const observer = new MutationObserver(() => scheduleSync(root));
      observer.observe(root.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-rank', 'data-taster', 'data-catalogue-type', 'data-archived', 'data-visual-ring']
      });
    }
  };
  if (root.readyState === 'loading') root.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
}

if (typeof document !== 'undefined') installRecommendationSubsections(document);
