// Moves the laurel row into the bottom of the image frame.
//
// The frame gains a black strip below the artwork and the ratings sit in it, under the
// smoke time. The strip is made with padding on a content-box frame, so every height the
// page already declares for .artframe keeps meaning "the artwork area" and none of the
// per-card image rules need touching.
//
// Static cards ship with the row inside .cardbody, so it is relocated here rather than only
// in the Worker's markup, which covers dynamic entries alone.

export const STRIP_STYLE_ID = 'catalogue-medal-strip-style';

export function medalsBelongInFrame(card) {
  const frame = card?.querySelector?.('.artframe');
  const medals = card?.querySelector?.('.medals');
  return Boolean(frame && medals && !frame.contains(medals));
}

export function moveMedalsIntoFrame(card) {
  if (!medalsBelongInFrame(card)) return false;
  const frame = card.querySelector('.artframe');
  const medals = card.querySelector('.medals');
  // After the smoke time, which is the last thing in the frame.
  frame.appendChild(medals);
  return true;
}

export function moveAllMedalsIntoFrames(root = document) {
  let moved = 0;
  root.querySelectorAll?.('article.card').forEach(card => {
    if (moveMedalsIntoFrame(card)) moved += 1;
  });
  return moved;
}

export function ensureStripStyle(doc = document) {
  if (doc.getElementById(STRIP_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STRIP_STYLE_ID;
  style.textContent = `
:root{--medal-strip:124px}
/* content-box keeps every declared .artframe height meaning the artwork area, so the strip
   is added below it rather than carved out of it, and no image rule has to change. */
html body article.card .artframe{
  box-sizing:content-box!important;
  padding-bottom:var(--medal-strip)!important;
}
/* The darkening gradient stops where the artwork stops. */
html body article.card .artframe:after{bottom:var(--medal-strip)!important}
/* The smoke time stays with the artwork, just above the strip. */
html body article.card .artframe .artmeta-bottom{bottom:calc(var(--medal-strip) + 10px)!important}
html body article.card .artframe .medals{
  position:absolute!important;left:0;right:0;bottom:0;height:var(--medal-strip);
  z-index:4;margin:0!important;padding:0 12px 10px!important;
  display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;
  gap:4px!important;align-content:end;
}
/* Brown on cream does not read on black. */
html body article.card .artframe .medals .rating>span{
  color:#cfab62!important;
  text-shadow:0 1px 2px rgba(0,0,0,.9)!important;
}
html body article.card .artframe .medals .subscore{
  color:#f6efe0!important;
  text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 7px rgba(0,0,0,.9)!important;
}
html body article.card .artframe .medals .rating.flavour-unrated .subscore,
html body article.card .artframe .medals .rating.value-unrated .subscore{color:#c9bda6!important}
@media(max-width:900px){
  :root{--medal-strip:96px}
  html body article.card .artframe .medals{padding:0 8px 8px!important;gap:3px!important}
}
`;
  doc.head.appendChild(style);
}

export function initMedalStrip(root = document) {
  ensureStripStyle(root.ownerDocument || root);
  moveAllMedalsIntoFrames(root);
  // Cards are injected and re-rendered after load, so keep watching.
  const observer = new MutationObserver(() => moveAllMedalsIntoFrames(root));
  observer.observe(root.body || root, { childList: true, subtree: true });
  return observer;
}

if (typeof document !== 'undefined' && !globalThis.__CATALOGUE_MEDAL_STRIP_TEST__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initMedalStrip());
  } else {
    initMedalStrip();
  }
}
