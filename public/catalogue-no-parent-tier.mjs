const PARENT_TIER_SELECTOR = '.parent-tier-badge,[data-parent-tier]';
const PARENT_TIER_TEXT = /^parent\s+tier\s*:/i;

function isElement(value) {
  return value && value.nodeType === 1;
}

function removeNodeIfParentTier(node) {
  if (!isElement(node)) return false;
  if (node.matches?.(PARENT_TIER_SELECTOR)) {
    node.remove();
    return true;
  }
  if (!node.children?.length && PARENT_TIER_TEXT.test(String(node.textContent || '').trim())) {
    node.remove();
    return true;
  }
  return false;
}

export function removeParentTierUi(root = document) {
  if (!root) return;
  removeNodeIfParentTier(root);

  root.querySelectorAll?.(PARENT_TIER_SELECTOR).forEach(node => node.remove());
  root.querySelectorAll?.('article.card *, [data-key] *').forEach(node => {
    if (!node.children?.length && PARENT_TIER_TEXT.test(String(node.textContent || '').trim())) node.remove();
  });
}

export function installParentTierGuard(doc = document) {
  if (!doc?.documentElement) return null;
  removeParentTierUi(doc);

  const Observer = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (typeof Observer !== 'function') return null;

  const observer = new Observer(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (!isElement(node)) continue;
        removeParentTierUi(node);
      }
    }
  });
  observer.observe(doc.documentElement, { childList:true, subtree:true });
  return observer;
}

if (typeof document !== 'undefined') {
  const start = () => installParentTierGuard(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
}
