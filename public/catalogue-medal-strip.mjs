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
/* The gradient keeps running to the bottom of the frame. Stopping it above the strip drew
   a seam across the frame, and the strip below paints over it anyway. */
/* The smoke time stays with the artwork, just above the strip. */
html body article.card .artframe .artmeta-bottom{bottom:calc(var(--medal-strip) + 10px)!important}
/* Opaque, and the same black as the frame. Better than trying to stop the artwork short:
   many cards scale or cover their image with their own !important rules, so it spills past
   the content box into the strip and shows through as a muddy panel. Painting over it is
   immune to every one of those rules and leaves no edge between strip and frame. */
html body article.card .artframe .medals{
  position:absolute!important;left:0;right:0;bottom:0;height:var(--medal-strip);
  z-index:4;margin:0!important;padding:0 12px 10px!important;
  background:#020202!important;
  display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;
  gap:4px!important;align-content:end;
}
/* Brown on cream does not read on black. */
html body article.card .artframe .medals .rating>span{
  color:#cfab62!important;
  text-shadow:0 1px 2px rgba(0,0,0,.9)!important;
}
/* The score reads as its own metal again, lightened only as far as a black backing needs. */
html body article.card .artframe .medals .subscore{
  text-shadow:0 1px 2px rgba(0,0,0,.95)!important;
}
html body article.card .artframe .medals .rating.gold .subscore{color:#e9c96f!important}
html body article.card .artframe .medals .rating.silver .subscore{color:#d9d9d3!important}
html body article.card .artframe .medals .rating.bronze .subscore{color:#dd9a5f!important}
html body article.card .artframe .medals .rating.flavour-unrated .subscore,
html body article.card .artframe .medals .rating.value-unrated .subscore{color:#9d938a!important}
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
