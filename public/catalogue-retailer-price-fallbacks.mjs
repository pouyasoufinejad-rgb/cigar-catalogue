const VERIFIED_RETAILER_PRICES = new Map([
  ['https://www.theindexcigars.com.au/products/undercrown-maduro-coronet-tin-of-10', 119],
  ['https://www.cigarhut.com.au/undercrown-maduro-coronets', 110],
  ['https://www.cigarworld.com.au/aud/categories/cigars/drew-estate-%28nicaragua%29/undercrown', 132]
]);

function comparableUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    let result = url.toString();
    if (url.pathname !== '/' && result.endsWith('/')) result = result.slice(0, -1);
    return result.toLowerCase();
  } catch (_) {
    return '';
  }
}

export function verifiedRetailerPriceFallback(url) {
  return VERIFIED_RETAILER_PRICES.get(comparableUrl(url)) ?? null;
}

function formatPrice(value) {
  return `A$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`;
}

export function applyVerifiedRetailerPriceFallbacks(root = document) {
  const card = root?.querySelector?.('article.card[data-key="undercrown-maduro-coronets"]');
  const grid = card?.querySelector?.('.retailer-matrix-grid');
  if (!grid) return false;

  const cells = Array.from(grid.children);
  let changed = false;
  for (let index = 4; index + 3 < cells.length; index += 4) {
    const priceCell = cells[index + 2];
    const link = cells[index + 3]?.querySelector?.('.retailer-matrix-open[href]');
    const price = verifiedRetailerPriceFallback(link?.href || link?.getAttribute?.('href'));
    if (price == null) continue;

    const current = String(priceCell?.textContent || '').trim();
    if (current && current !== '—') continue;

    const next = formatPrice(price);
    if (priceCell && current !== next) {
      priceCell.textContent = next;
      changed = true;
    }
  }
  return changed;
}

function scheduleApply() {
  setTimeout(() => applyVerifiedRetailerPriceFallbacks(document), 0);
}

export function initVerifiedRetailerPriceFallbacks() {
  if (typeof document === 'undefined') return;
  scheduleApply();
  document.addEventListener('catalogue:cards-refreshed', scheduleApply);
  if (typeof MutationObserver !== 'undefined' && document.body) {
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList:true, subtree:true });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initVerifiedRetailerPriceFallbacks, { once:true });
  else initVerifiedRetailerPriceFallbacks();
}
