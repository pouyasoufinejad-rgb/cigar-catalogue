function defaultRoot() {
  return typeof document !== 'undefined' ? document : null;
}

function viewFor(root) {
  return root?.defaultView || root?.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scrollPosition(view) {
  return {
    x: finite(view?.scrollX ?? view?.pageXOffset, 0),
    y: finite(view?.scrollY ?? view?.pageYOffset, 0)
  };
}

function cardAnchor(root, view) {
  const cards = Array.from(root?.querySelectorAll?.('article.card[data-key]') || []);
  const viewportHeight = Math.max(0, finite(view?.innerHeight, 0));
  let best = null;
  for (const card of cards) {
    const key = String(card?.dataset?.key || '').trim();
    const rect = card?.getBoundingClientRect?.();
    if (!key || !rect || !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) continue;
    if (rect.bottom <= 0 || (viewportHeight && rect.top >= viewportHeight)) continue;
    const score = rect.top <= 0 && rect.bottom > 0 ? 0 : Math.abs(rect.top);
    if (!best || score < best.score) best = { key, top:rect.top, score };
  }
  return best;
}

function findCard(root, key) {
  if (!root || !key) return null;
  const cards = Array.from(root.querySelectorAll?.('article.card[data-key]') || []);
  return cards.find(card => card?.dataset?.key === key) || null;
}

function scrollInstant(view, root, x, y) {
  if (!view?.scrollTo) return;
  const doc = root?.documentElement ? root : root?.ownerDocument;
  const style = doc?.documentElement?.style;
  const previous = style?.scrollBehavior;
  try {
    if (style) style.scrollBehavior = 'auto';
    try { view.scrollTo({ left:x, top:y, behavior:'auto' }); }
    catch (_) { view.scrollTo(x, y); }
  } finally {
    if (style) style.scrollBehavior = previous || '';
  }
}

export function captureViewport(root = defaultRoot()) {
  const view = viewFor(root);
  const position = scrollPosition(view);
  const anchor = cardAnchor(root, view);
  return {
    x:position.x,
    y:position.y,
    anchorKey:anchor?.key || '',
    anchorTop:Number.isFinite(anchor?.top) ? anchor.top : null
  };
}

export function restoreViewport(snapshot, root = defaultRoot()) {
  if (!snapshot) return false;
  const view = viewFor(root);
  if (!view) return false;
  const current = scrollPosition(view);
  let targetY = finite(snapshot.y, current.y);
  if (snapshot.anchorKey && Number.isFinite(snapshot.anchorTop)) {
    const card = findCard(root, snapshot.anchorKey);
    const rect = card?.getBoundingClientRect?.();
    if (rect && Number.isFinite(rect.top)) {
      targetY = current.y + (rect.top - snapshot.anchorTop);
    }
  }
  scrollInstant(view, root, finite(snapshot.x, current.x), Math.max(0, targetY));
  return true;
}

export function restoreViewportAfterLayout(snapshot, root = defaultRoot()) {
  const view = viewFor(root);
  restoreViewport(snapshot, root);
  const raf = view?.requestAnimationFrame?.bind(view) || globalThis.requestAnimationFrame?.bind(globalThis);
  if (!raf) return;
  raf(() => {
    restoreViewport(snapshot, root);
    raf(() => restoreViewport(snapshot, root));
  });
}
