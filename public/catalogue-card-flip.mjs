// Turns a card over to its notes face.
//
// The faces are rendered by the Worker and were written into the static cards by
// scripts/split-static-card-faces.mjs, so this module only has to bind the control and
// carry the state. It builds nothing on load: a card that arrived without faces stays as
// it is rather than being restructured in the browser, which is how the prose used to
// flash on the front before being moved.

import {
  BACK_LABEL,
  FLIPPED_ATTR,
  FRONT_LABEL
} from './catalogue-card-faces.mjs?v=card-flip-1';

function controlFor(card) {
  return card?.querySelector?.(':scope > .cardbody > .card-flip') || null;
}

export function isFlipped(card) {
  return card?.getAttribute?.(FLIPPED_ATTR) === '1';
}

export function setFlipped(card, flipped) {
  if (!card?.querySelector) return false;
  if (!card.querySelector('.card-face-back')) return false;
  if (flipped) card.setAttribute(FLIPPED_ATTR, '1');
  else card.removeAttribute(FLIPPED_ATTR);
  const control = controlFor(card);
  if (control) {
    control.setAttribute('aria-expanded', flipped ? 'true' : 'false');
    const label = control.querySelector('.card-flip-label');
    if (label) label.textContent = flipped ? BACK_LABEL : FRONT_LABEL;
  }
  return true;
}

export function toggleCard(card) {
  return setFlipped(card, !isFlipped(card));
}

// A card can be re-rendered under the reader, and a selector rebuilt from a template would
// come back showing its front while the article still claims to be flipped.
export function resyncCard(card) {
  if (!card?.querySelector) return;
  if (!card.querySelector('.card-face-back')) {
    card.removeAttribute(FLIPPED_ATTR);
    return;
  }
  setFlipped(card, isFlipped(card));
}

function onClick(event) {
  const control = event.target?.closest?.('[data-card-flip]');
  if (!control) return;
  const card = control.closest('article.card');
  if (!card) return;
  event.preventDefault();
  toggleCard(card);
}

let bound = false;

export function initCardFlip(root = globalThis.document) {
  if (bound || !root?.addEventListener) return;
  bound = true;
  // One delegated listener: cards are injected and replaced throughout the page's life,
  // and per-card listeners would be lost every time one is rebuilt.
  root.addEventListener('click', onClick);
}

if (typeof document !== 'undefined' && !globalThis.__CATALOGUE_CARD_FLIP_TEST__) {
  initCardFlip(document);
}
