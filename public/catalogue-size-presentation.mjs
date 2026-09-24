import { sizeRatingForRing, sizeTierForDimensions } from './catalogue-size-rules.mjs';

const RING_INPUT_ID = 'catalogue-v139-ring';
const LENGTH_INPUT_ID = 'catalogue-v139-length';
const SIZE_INPUT_ID = 'catalogue-admin-size';
const SAVE_BUTTON_ID = 'catalogue-admin-save';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sizeRatingNode(card) {
  return Array.from(card?.querySelectorAll?.('.rating') || []).find(node =>
    node.querySelector(':scope > span')?.textContent?.trim().toLowerCase() === 'size'
  ) || null;
}

export function ringGaugeForCard(card) {
  const artRing = finite(card?.querySelector?.('.artframe')?.dataset?.visualRing, NaN);
  if (Number.isFinite(artRing) && artRing > 0) return artRing;

  const sizeText = Array.from(card?.querySelectorAll?.('.facts b') || [])
    .map(node => node.textContent || '')
    .find(text => /[×x]\s*\d+(?:\.\d+)?/.test(text));
  const match = String(sizeText || '').match(/[×x]\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

// The Size score reads length as well as ring, so the card has to give up both. The frame
// carries them as data attributes; the facts line is the fallback for a card that predates
// them, where the text reads `4.5" x 44`.
export function lengthForCard(card) {
  const artLength = finite(card?.querySelector?.('.artframe')?.dataset?.visualLength, NaN);
  if (Number.isFinite(artLength) && artLength > 0) return artLength;

  const sizeText = Array.from(card?.querySelectorAll?.('.facts b') || [])
    .map(node => node.textContent || '')
    .find(text => /\d+(?:\.\d+)?\s*[^\d]{0,3}[×x]\s*\d/.test(text));
  const match = String(sizeText || '').match(/(\d+(?:\.\d+)?)\s*[^\d]{0,3}[×x]/);
  return match ? Number(match[1]) : 0;
}

export function applySizeRatingToCard(card, explicitRing = null, explicitLength = null) {
  if (!card?.querySelector) return null;
  const ring = explicitRing == null ? ringGaugeForCard(card) : finite(explicitRing, 0);
  if (!(ring > 0)) return null;
  const length = explicitLength == null ? lengthForCard(card) : finite(explicitLength, 0);

  const node = sizeRatingNode(card);
  if (!node) return null;

  const { tier, score } = sizeRatingForRing(ring, length);
  const scoreClass = score >= 8 ? 'score-high' : score >= 5 ? 'score-mid' : 'score-low';
  node.classList.remove('gold', 'silver', 'bronze', 'score-high', 'score-mid', 'score-low');
  node.classList.add(tier, scoreClass);

  const medal = node.querySelector('.medal');
  if (medal) {
    medal.classList.remove('gold', 'silver', 'bronze');
    medal.classList.add(tier);
  }

  const bold = node.querySelector('b');
  if (bold) bold.textContent = tier[0].toUpperCase() + tier.slice(1);

  let subscore = node.querySelector('.subscore');
  if (!subscore && typeof document !== 'undefined') {
    subscore = document.createElement('small');
    subscore.className = 'subscore';
    node.appendChild(subscore);
  }
  if (subscore) subscore.textContent = `${score}/10`;

  card.dataset.format = String(tier === 'gold' ? 3 : tier === 'silver' ? 2 : 1);
  card.dataset.sizeScore = String(score);
  return { ring, tier, score };
}

export function refreshSizeRatings(root = document) {
  if (!root?.querySelectorAll) return 0;
  let updated = 0;
  root.querySelectorAll('article.card[data-key]').forEach(card => {
    if (applySizeRatingToCard(card)) updated += 1;
  });
  return updated;
}

export function syncAdminSizeFromDimensions(root = document) {
  const field = id => root?.getElementById?.(id) || root?.querySelector?.(`#${id}`);
  const ringInput = field(RING_INPUT_ID);
  const sizeInput = field(SIZE_INPUT_ID);
  if (!ringInput || !sizeInput) return null;
  const ring = finite(ringInput.value, 0);
  if (!(ring > 0)) return null;
  // A missing length input leaves the tier on ring alone rather than guessing at one.
  const length = finite(field(LENGTH_INPUT_ID)?.value, 0);
  const tier = sizeTierForDimensions(ring, length);
  if (sizeInput.value !== tier) {
    sizeInput.value = tier;
    sizeInput.dispatchEvent?.(new Event('change', { bubbles: true }));
  }
  return tier;
}

let refreshTimer = 0;
function scheduleRefresh() {
  if (refreshTimer || typeof document === 'undefined') return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    refreshSizeRatings(document);
    syncAdminSizeFromDimensions(document);
  }, 0);
}

export function installCatalogueSizePresentation() {
  if (typeof document === 'undefined') return;
  const start = () => {
    refreshSizeRatings(document);
    syncAdminSizeFromDimensions(document);

    document.addEventListener('input', event => {
      if (event.target?.id === RING_INPUT_ID) scheduleRefresh();
    });
    document.addEventListener('change', event => {
      if (event.target?.id === RING_INPUT_ID) scheduleRefresh();
    });
    document.addEventListener('click', event => {
      if (event.target?.id === SAVE_BUTTON_ID || event.target?.closest?.(`#${SAVE_BUTTON_ID}`)) {
        syncAdminSizeFromDimensions(document);
        return;
      }
      queueMicrotask?.(() => syncAdminSizeFromDimensions(document));
    }, true);

    if (typeof MutationObserver !== 'undefined' && document.body) {
      const observer = new MutationObserver(scheduleRefresh);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-visual-ring']
      });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

if (typeof document !== 'undefined') installCatalogueSizePresentation();
