const MATRIX_SELECTOR = '.retailer-matrix';

function cleanText(value) {
  return String(value || '').trim();
}

export function retailerBestPriceAttribution(rowIndex, packageText, perStickText) {
  if (Number(rowIndex) !== 0) return '—';
  const packageValue = cleanText(packageText);
  const stickValue = cleanText(perStickText);
  const parts = [];
  if (packageValue && packageValue !== '—') parts.push(packageValue);
  if (stickValue && stickValue !== '—') parts.push(`${stickValue} / stick`);
  return parts.join(' · ') || '—';
}

function factText(card, index) {
  const node = card?.querySelectorAll?.('.facts > div')?.[index];
  if (!node) return '—';
  const primary = cleanText(node.querySelector('b')?.textContent);
  const secondary = cleanText(node.querySelector('small')?.textContent);
  return [primary, secondary].filter(Boolean).join(' · ') || '—';
}

function formatPerStick(card) {
  const perStick = Number(card?.dataset?.price);
  if (Number.isFinite(perStick)) return `A$${Number.isInteger(perStick) ? perStick.toFixed(0) : perStick.toFixed(2)}`;
  return factText(card, 1).split(' · ')[0] || '—';
}

export function applyBestAvailableRetailerPrice(card) {
  const matrix = card?.querySelector?.(MATRIX_SELECTOR);
  const grid = matrix?.querySelector?.('.retailer-matrix-grid');
  if (!grid) return false;

  const columns = grid.querySelectorAll('.retailer-matrix-head').length;
  if (columns < 4) return false;
  const bodyCells = Array.from(grid.children).slice(columns);
  if (bodyCells.length < columns) return false;

  const bestPrice = retailerBestPriceAttribution(0, factText(card, 0), formatPerStick(card));
  const firstPriceCell = bodyCells[2];
  if (!firstPriceCell || bestPrice === '—') return false;

  firstPriceCell.textContent = bestPrice;
  firstPriceCell.dataset.bestAvailablePrice = '1';
  return true;
}

function applyAll(root = document) {
  root.querySelectorAll?.('article.card[data-key]').forEach(applyBestAvailableRetailerPrice);
}

let refreshTimer = 0;
function scheduleApply() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    applyAll(document);
  }, 0);
}

function installObserver() {
  if (typeof MutationObserver === 'undefined' || !document.body) return;
  const observer = new MutationObserver(mutations => {
    const touchesMatrix = mutations.some(mutation => {
      const target = mutation.target;
      if (target?.nodeType === 1 && (target.matches?.(MATRIX_SELECTOR) || target.closest?.(MATRIX_SELECTOR))) return true;
      return Array.from(mutation.addedNodes || []).some(node =>
        node?.nodeType === 1 && (node.matches?.(MATRIX_SELECTOR) || node.querySelector?.(MATRIX_SELECTOR))
      );
    });
    if (touchesMatrix) scheduleApply();
  });
  observer.observe(document.body, { childList:true, subtree:true });
}

export function initRetailerBestPrice() {
  if (typeof document === 'undefined') return;
  applyAll(document);
  document.addEventListener('catalogue:cards-refreshed', scheduleApply);
  installObserver();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRetailerBestPrice, { once:true });
  else initRetailerBestPrice();
}
