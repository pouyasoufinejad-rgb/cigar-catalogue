const ARTWORK_SELECTOR = 'article.card .artframe img';
const VISIBLE_MARGIN_PX = 160;
const WARM_VIEWPORTS = 2.25;

export function imagePriorityBand(rect, viewportHeight) {
  const height = Math.max(1, Number(viewportHeight) || 1);
  const top = Number(rect?.top);
  const bottom = Number(rect?.bottom);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return 'far';
  if (bottom >= -VISIBLE_MARGIN_PX && top <= height + VISIBLE_MARGIN_PX) return 'visible';
  const warmDistance = height * WARM_VIEWPORTS;
  if (bottom >= -warmDistance && top <= height + warmDistance) return 'warm';
  return 'far';
}

export function promoteArtworkImage(img, band) {
  if (!img) return;
  img.decoding = 'async';
  if (band === 'visible') {
    img.loading = 'eager';
    img.fetchPriority = 'high';
    return;
  }
  if (band === 'warm') {
    img.loading = 'eager';
    if (img.fetchPriority !== 'high') img.fetchPriority = 'auto';
    return;
  }
  if (!img.complete) {
    img.loading = 'lazy';
    if (img.fetchPriority !== 'high') img.fetchPriority = 'low';
  }
}

export function initCatalogueImagePriority(root = document) {
  const images = new Set();
  let scheduled = false;

  const scan = () => {
    scheduled = false;
    const viewportHeight = globalThis.innerHeight || root.documentElement?.clientHeight || 800;
    for (const img of images) {
      if (!img?.isConnected) {
        images.delete(img);
        continue;
      }
      const frame = img.closest?.('.artframe') || img;
      promoteArtworkImage(img, imagePriorityBand(frame.getBoundingClientRect?.(), viewportHeight));
    }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    (globalThis.requestAnimationFrame || globalThis.setTimeout)(scan);
  };

  const addImages = scope => {
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll(ARTWORK_SELECTOR).forEach(img => images.add(img));
    if (scope.matches?.(ARTWORK_SELECTOR)) images.add(scope);
  };

  addImages(root);
  scan();

  globalThis.addEventListener?.('scroll', schedule, { passive:true });
  globalThis.addEventListener?.('resize', schedule, { passive:true });

  if (typeof MutationObserver !== 'undefined' && root.body) {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes?.forEach(node => {
          if (node?.nodeType === 1) addImages(node);
        });
      }
      schedule();
    });
    observer.observe(root.body, { childList:true, subtree:true });
  }

  return { scan, imageCount:() => images.size };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initCatalogueImagePriority(document), { once:true });
  } else {
    initCatalogueImagePriority(document);
  }
}
