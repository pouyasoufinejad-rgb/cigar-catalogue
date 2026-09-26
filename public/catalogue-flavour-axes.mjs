// The seven flavour axes a cigar is profiled against.
//
// One definition for all of it: the label, the colour, and the mask the icon is drawn from.
// The bar and its icon take the same colour from the same place, because the point of the
// colour is to tie them together and two declarations would eventually disagree.
//
// The colours are the artwork's own, sampled from the supplied icons rather than chosen to
// resemble them, so a mask tinted with its axis colour is indistinguishable from the
// original drawing. scripts/build-flavour-icons.mjs re-samples on every build and says so
// if a value here has drifted from the art.
//
// No DOM access: the Worker renders these into the card.

import { FLAVOUR_ART } from './catalogue-flavour-art.mjs';

export const FLAVOUR_SCALE_MAX = 5;

export const FLAVOUR_AXES = Object.freeze([
  { id: 'sweet',  label: 'Sweet',  colour: '#fcf4e4', art: 'sugar crystals' },
  { id: 'pepper', label: 'Pepper', colour: '#b03e2e', art: 'pepper grinder' },
  { id: 'spice',  label: 'Spice',  colour: '#bc4c1c', art: 'spice bowl' },
  { id: 'earth',  label: 'Earth',  colour: '#141414', art: 'soil and trowel' },
  { id: 'nuts',   label: 'Nuts',   colour: '#ac743c', art: 'hazelnuts' },
  { id: 'cedar',  label: 'Cedar',  colour: '#c48c5c', art: 'cedar wood' },
  { id: 'smoke',  label: 'Smoke',  colour: '#5c5c5c', art: 'smoke curls' }
].map(axis => Object.freeze({ ...axis, mask: FLAVOUR_ART[axis.id] || '' })));

// An axis whose artwork has not been built yet has no mask, and the page has to cope with
// that rather than requesting a file that is not there.
export const FLAVOUR_AXES_WITH_ART = Object.freeze(FLAVOUR_AXES.filter(axis => axis.mask));

export const FLAVOUR_AXIS_IDS = Object.freeze(FLAVOUR_AXES.map(axis => axis.id));

const byId = new Map(FLAVOUR_AXES.map(axis => [axis.id, axis]));
export const flavourAxis = id => byId.get(String(id || '').toLowerCase()) || null;

// An axis a cigar has not been profiled against is absent, not zero: zero is a judgement
// that the flavour is not there, and the two must not render the same way.
export function normaliseFlavourIntensity(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(FLAVOUR_SCALE_MAX, Math.round(number)));
}

// Only the named axes, only real values, always in the catalogue's order rather than
// whatever order the record happened to store them in.
export function normaliseFlavourProfile(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const profile = {};
  for (const axis of FLAVOUR_AXES) {
    const value = normaliseFlavourIntensity(raw[axis.id]);
    if (value !== null) profile[axis.id] = value;
  }
  return profile;
}

export function hasFlavourProfile(profile) {
  return Object.keys(normaliseFlavourProfile(profile)).length > 0;
}

const esc = value => String(value ?? '').replace(/[&<>"']/g,
  ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// One row per profiled axis: the icon, then the intensity as filled pips.
//
// Pips rather than a continuous bar, because the scale is five whole steps and a part-full
// bar invites reading a precision that is not there. Every pip carries the same neutral
// hairline whatever the axis colour is: Sweet is ivory on a cream card and would otherwise
// be a row of invisible boxes, and Earth is near-black against the dark frame.
export function flavourProfileMarkup(input) {
  const profile = normaliseFlavourProfile(input);
  const axes = FLAVOUR_AXES.filter(axis => Object.prototype.hasOwnProperty.call(profile, axis.id));
  if (!axes.length) return '';

  const rows = axes.map(axis => {
    const value = profile[axis.id];
    const pips = Array.from({ length: FLAVOUR_SCALE_MAX }, (_, index) =>
      `<i class="flavour-pip${index < value ? ' is-on' : ''}"></i>`).join('');
    // An axis whose artwork has not been built yet still gets a row; it shows its colour as
    // a plain disc rather than asking the browser for a file that is not there.
    const icon = axis.mask
      ? `<i class="flavour-icon" style="-webkit-mask-image:url('${esc(axis.mask)}');mask-image:url('${esc(axis.mask)}')"></i>`
      : '<i class="flavour-icon flavour-icon-plain"></i>';
    return `<div class="flavour-axis" data-axis="${esc(axis.id)}" style="--flavour-colour:${esc(axis.colour)}"`
      + ` role="img" aria-label="${esc(axis.label)} ${value} of ${FLAVOUR_SCALE_MAX}"`
      + ` title="${esc(axis.label)} ${value}/${FLAVOUR_SCALE_MAX}">`
      + `${icon}<span class="flavour-pips">${pips}</span></div>`;
  }).join('');

  return `<div class="flavour-profile" aria-label="Flavour profile">${rows}</div>`;
}
