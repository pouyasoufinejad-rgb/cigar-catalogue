// The two faces of a catalogue card, and the control that turns it over.
//
// Three places build this structure: the Worker renders dynamic entries, a one-off script
// rewrote the static cards in the page, and the client runtime rebuilds the back face when
// a blend variant changes. Three copies of the same class names is how they drift, so the
// names and the control markup live here. No DOM access, so the Worker can import it.

export const FACES_CLASS = 'card-faces';
export const FRONT_CLASS = 'card-face card-face-front';
export const BACK_CLASS = 'card-face card-face-back';
export const FLIP_CLASS = 'card-flip';

// The article carries the state so CSS can reach both faces and the control from one place.
export const FLIPPED_ATTR = 'data-flipped';

export const FRONT_LABEL = 'Notes';
export const BACK_LABEL = 'Back';

// The back holds the reading matter: the Experience chips and the prose. Everything a
// reader acts on, the prices, the stock line and the retailer links, stays on the front.
export const BACK_FACE_SELECTORS = Object.freeze(['.tag-groups', 'p.summary', 'p.mog-note']);

export function flipControlMarkup(key = '', flipped = false) {
  const id = key ? ` id="card-flip-${key}"` : '';
  const controls = key ? ` aria-controls="card-back-${key}"` : '';
  return `<button class="${FLIP_CLASS}" type="button"${id}${controls}`
    + ` aria-expanded="${flipped ? 'true' : 'false'}" data-card-flip>`
    + `<span class="card-flip-label">${flipped ? BACK_LABEL : FRONT_LABEL}</span></button>`;
}

export function backFaceAttributes(key = '') {
  return key ? ` id="card-back-${key}"` : '';
}
