const STYLE_ID = 'catalogue-presentation-v151';
const STOCK_COLOURS = new Set(['green', 'yellow', 'red']);

function normaliseGoldLabels(labels = []) {
  return [...new Set(Array.from(labels || [])
    .map(label => String(label || '').trim().toLowerCase())
    .filter(Boolean))].sort();
}

export function isSubstantialGoldSet(labels = []) {
  const golds = normaliseGoldLabels(labels);
  return golds.length === 1 && golds[0] === 'size'
    || golds.length === 2 && golds[0] === 'size' && golds[1] === 'strength';
}

export function recommendationDestination(labels = []) {
  const golds = new Set(normaliseGoldLabels(labels));
  if (isSubstantialGoldSet(golds)) return 'substantial';
  const strengthGold = golds.has('strength');
  const qualityGold = golds.has('quality');
  if (strengthGold && qualityGold) return 'elite';
  if (strengthGold || qualityGold) return 'strong';
  if (golds.has('value')) return 'noteworthy-cheap';
  return 'noteworthy-neither';
}

export function stockColourForStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'in') return 'green';
  if (value === 'out' || value === 'delisted') return 'red';
  return 'yellow';
}

function stockLabelForColour(colour) {
  if (colour === 'green') return 'In stock';
  if (colour === 'red') return 'Out of stock';
  return 'Stock status unknown';
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
article.card .freshness{display:none!important}
article.card .eyebrow .stock-dot{
  display:inline-block;
  width:9px;
  height:9px;
  margin-right:6px;
  border-radius:50%;
  border:1px solid rgba(255,255,255,.7);
  box-shadow:0 1px 4px rgba(0,0,0,.5);
  vertical-align:1px;
  flex:0 0 auto;
}
article.card .eyebrow .stock-dot-green{background:#3f9a4a}
article.card .eyebrow .stock-dot-yellow{background:#d7a52f}
article.card .eyebrow .stock-dot-red{background:#a92d35}
`;
  document.head.appendChild(style);
}

function cardGoldLabels(card) {
  return Array.from(card?.querySelectorAll?.('.rating.gold') || []).map(node =>
    node.querySelector(':scope > span')?.textContent?.trim().toLowerCase() || ''
  ).filter(Boolean);
}

function effectiveStockStatus(card) {
  const pin = String(card?.dataset?.stockPin || '').trim().toLowerCase();
  if (pin === 'in' || pin === 'out' || pin === 'hold') return pin;
  return String(card?.dataset?.stock || 'unknown').trim().toLowerCase();
}

export function ensureStockDot(card) {
  if (!card?.querySelector) return null;
  const eyebrow = card.querySelector('.eyebrow');
  if (!eyebrow) return null;

  card.querySelector('.rankflag .stock-dot')?.remove();
  let dot = eyebrow.querySelector('.stock-dot');
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'stock-dot';
    eyebrow.insertBefore(dot, eyebrow.firstChild);
  }

  dot.textContent = '';
  dot.removeAttribute?.('title');
  const colour = stockColourForStatus(effectiveStockStatus(card));
  const className = `stock-dot stock-dot-${STOCK_COLOURS.has(colour) ? colour : 'yellow'}`;
  if (dot.className !== className) dot.className = className;
  const label = stockLabelForColour(colour);
  if (dot.getAttribute('aria-label') !== label) dot.setAttribute('aria-label', label);
  return dot;
}

function destinationGrid(root, destination) {
  const selector = destination === 'substantial'
    ? '[data-noteworthy-section="substantial"] .grid'
    : destination === 'elite'
      ? '[data-tier-section="elite"] .grid'
      : destination === 'strong'
        ? '[data-tier-section="strong"] .grid'
        : destination === 'noteworthy-cheap'
          ? '[data-noteworthy-section="cheap"] .grid'
          : '[data-noteworthy-section="neither"] .grid';
  return root.querySelector(selector);
}

function isUnavailableCard(card) {
  return card.classList?.contains('is-unavailable')
    || card.closest?.('.unavailable-grid')
    || ['out', 'delisted'].includes(effectiveStockStatus(card));
}

function insertByRank(grid, card) {
  if (!grid || !card) return;
  const rank = Number(card.dataset?.rank) || Number.MAX_SAFE_INTEGER;
  const siblings = Array.from(grid.querySelectorAll(':scope > article.card'));
  const before = siblings.find(node => (Number(node.dataset?.rank) || Number.MAX_SAFE_INTEGER) > rank);
  if (before) grid.insertBefore(card, before);
  else grid.appendChild(card);
}

export function reclassifySubstantialCards(root = document) {
  if (!root?.querySelectorAll) return 0;
  const sort = root.getElementById?.('sort') || root.querySelector?.('#sort');
  if (sort?.value && sort.value !== 'rank') return 0;
  const substantialGrid = destinationGrid(root, 'substantial');
  if (!substantialGrid) return 0;

  let moved = 0;
  root.querySelectorAll('article.card[data-key]').forEach(card => {
    if (card.dataset.archived === '1' || card.dataset.taster === '1' || isUnavailableCard(card)) return;
    const golds = cardGoldLabels(card);
    const eligible = isSubstantialGoldSet(golds);
    const inSubstantial = card.closest?.('[data-noteworthy-section="substantial"]') !== null;

    if (eligible && !inSubstantial) {
      insertByRank(substantialGrid, card);
      moved += 1;
      return;
    }
    if (!eligible && inSubstantial) {
      const target = destinationGrid(root, recommendationDestination(golds));
      if (target && target !== substantialGrid) {
        insertByRank(target, card);
        moved += 1;
      }
    }
  });
  return moved;
}

let refreshTimer = 0;
function refreshPresentation() {
  refreshTimer = 0;
  ensureStyle();
  document.querySelectorAll('article.card[data-key]').forEach(ensureStockDot);
  reclassifySubstantialCards(document);
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(refreshPresentation, 0);
}

export function installCataloguePresentation() {
  if (typeof document === 'undefined') return;
  ensureStyle();
  const start = () => {
    refreshPresentation();
    document.getElementById('sort')?.addEventListener('change', scheduleRefresh);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      const observer = new MutationObserver(scheduleRefresh);
      observer.observe(document.body, {
        subtree:true,
        childList:true,
        attributes:true,
        attributeFilter:['class', 'data-stock', 'data-stock-pin', 'data-archived', 'data-taster']
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
}

if (typeof document !== 'undefined') installCataloguePresentation();
