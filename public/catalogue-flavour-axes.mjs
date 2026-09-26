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
