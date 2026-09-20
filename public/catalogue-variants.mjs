// Size variants: one catalogue entry, several vitolas of the exact same cigar.
//
// A variant is the same blend and construction in a different size. Anything that changes
// the smoke itself — a different wrapper, a different blend, a materially different shape —
// stays a separate catalogue entry, and packaging alone (tin, box, tubo, pack count) is not
// a variant at all, only a different way to buy the same size.
//
// Nothing here renders or reads the DOM, so the Worker and the browser share one definition
// of what a variant means and score it identically.

import { sizeTierForRing } from './catalogue-size-rules.mjs';

// The fields a vitola may legitimately change. Blend and production data is deliberately
// absent: wrapper, binder, filler, country, strength, quality and flavour describe the
// cigar, not its size, and a variant that needed to change them would not be a variant.
// Practical is here because it describes the smoke's handling, which is a function of the
// size: the cadence band follows the ring gauge, and the package line follows how that size
// is sold. Production stays out, because wrapper, binder and filler are the blend.
export const VARIANT_FIELDS = Object.freeze([
  'title', 'eyebrow', 'length', 'ring', 'packageLabel', 'packagePrice', 'price',
  'retailerLinks', 'stock', 'smokeTime', 'imageUrl', 'summaryHtml', 'noteHtml', 'size',
  'practicalLines', 'packageCount', 'priceChecked', 'priceNote', 'stockChecked'
]);

// A blend variant is broader than a size variant. It can change the tobacco, ratings and
// copy as well as price/stock, and it can carry its own sizeVariants when that blend has
// more than one vitola. The parent card stays the catalogue identity; Blend and Size are
// independent selectors layered on top of it.
export const BLEND_VARIANT_FIELDS = Object.freeze([
  ...VARIANT_FIELDS,
  'productionLines', 'strength', 'quality', 'flavour', 'risk', 'country',
  'experienceTags', 'sizeVariants', 'defaultVariantId'
]);

const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const text = value => (typeof value === 'string' ? value : value === 0 || value ? String(value) : '');
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export function variantSlug(value) {
  const slug = text(value).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || '';
}

// A package price over a known count is the honest way to a per-stick figure. A count of
// one, or no count at all, means the package price is the stick price.
export function perStickPrice({ packagePrice, packageCount, price } = {}) {
  const explicit = finite(price, 0);
  if (explicit > 0) return Math.round(explicit * 100) / 100;
  const total = finite(packagePrice, 0);
  const count = Math.max(1, Math.round(finite(packageCount, 1)));
  if (!(total > 0)) return 0;
  return Math.round((total / count) * 100) / 100;
}

export function normaliseVariant(input, index = 0) {
  const raw = input && typeof input === 'object' ? input : {};
  const label = text(raw.label || raw.name || raw.vitola).trim();
  // A variant is a named vitola. Something with no name and no id is not a size, it is
  // stray data, and inventing "variant-3" for it would put a blank option in the selector.
  const id = variantSlug(raw.id || label);
  if (!id) return null;
  void index;

  const packageCount = Math.max(1, Math.round(finite(raw.packageCount, 1)));
  const price = perStickPrice(raw);
  // A retailer range like "44-949" spans every option on the page and says nothing about
  // what one vitola costs, so a variant carrying only a range has no price at all rather
  // than a guessed one. Value stays unrated for it instead of being invented.
  const priceUnverified = !(price > 0);

  const variant = {
    id,
    label: label || id,
    priceUnverified,
    packageCount
  };
  if (raw.title) variant.title = text(raw.title).trim();
  if (raw.eyebrow) variant.eyebrow = text(raw.eyebrow).trim();
  if (finite(raw.length, 0) > 0) variant.length = finite(raw.length);
  if (finite(raw.ring, 0) > 0) variant.ring = Math.round(finite(raw.ring));
  if (raw.packageLabel) variant.packageLabel = text(raw.packageLabel).trim();
  if (finite(raw.packagePrice, 0) > 0) variant.packagePrice = finite(raw.packagePrice);
  if (price > 0) variant.price = price;
  if (Array.isArray(raw.retailerLinks)) {
    variant.retailerLinks = raw.retailerLinks.map(link => text(link).trim()).filter(Boolean);
  }
  if (['in', 'out', 'unknown'].includes(raw.stock)) variant.stock = raw.stock;
  if (raw.smokeTime) variant.smokeTime = text(raw.smokeTime).trim();
  if (text(raw.imageUrl).startsWith('/')) variant.imageUrl = text(raw.imageUrl);
  if (raw.summaryHtml) variant.summaryHtml = text(raw.summaryHtml);
  if (raw.noteHtml) variant.noteHtml = text(raw.noteHtml);
  if (Array.isArray(raw.practicalLines)) {
    variant.practicalLines = raw.practicalLines.map(line => text(line).trim()).filter(Boolean);
  }
  if (raw.priceNote) variant.priceNote = text(raw.priceNote).trim();
  if (raw.priceChecked) variant.priceChecked = text(raw.priceChecked).trim();
  if (raw.stockChecked) variant.stockChecked = text(raw.stockChecked).trim();
  // A Size medal follows from the ring gauge, so a variant that changes ring gets its own
  // medal without anyone restating it. An explicit tier still wins if one is given.
  if (['gold', 'silver', 'bronze'].includes(raw.size)) variant.size = raw.size;
  else if (variant.ring) variant.size = sizeTierForRing(variant.ring);
  return variant;
}

export function normaliseVariants(record) {
  const list = Array.isArray(record?.sizeVariants) ? record.sizeVariants : [];
  const seen = new Set();
  const output = [];
  for (const [index, raw] of list.entries()) {
    const variant = normaliseVariant(raw, index);
    if (!variant || seen.has(variant.id)) continue;
    seen.add(variant.id);
    output.push(variant);
  }
  return output;
}

export function hasVariants(record) {
  return normaliseVariants(record).length > 1;
}

// The saved default is what the catalogue shows first. Selecting another size is a view
// change only, so it never writes here.
export function defaultVariantId(record) {
  const variants = normaliseVariants(record);
  if (!variants.length) return '';
  const saved = variantSlug(record?.defaultVariantId);
  return variants.some(variant => variant.id === saved) ? saved : variants[0].id;
}

export function resolveVariantId(record, requestedId = '') {
  const variants = normaliseVariants(record);
  if (!variants.length) return '';
  const requested = variantSlug(requestedId);
  return variants.some(variant => variant.id === requested) ? requested : defaultVariantId(record);
}

// The record as it should be scored and rendered with one size selected. Everything the
// variant does not state stays the parent's, so blend and production data is shared by
// construction rather than by being copied onto every size.
export function variantEffectiveRecord(record, requestedId = '') {
  const base = record && typeof record === 'object' ? record : {};
  const variants = normaliseVariants(base);
  if (!variants.length) {
    return { record: { ...base }, variant: null, variantId: '', variants: [] };
  }
  const variantId = resolveVariantId(base, requestedId);
  const variant = variants.find(item => item.id === variantId) || variants[0];
  const merged = { ...base };
  for (const field of VARIANT_FIELDS) {
    if (own(variant, field)) merged[field] = variant[field];
  }

  // The parent record describes its original/default vitola. Alternate sizes must never
  // silently borrow another vitola's dimensions, stock, retailer or freshness metadata.
  const isSavedDefault = variant.id === defaultVariantId(base);
  if (!isSavedDefault) {
    if (!own(variant, 'length')) merged.length = 0;
    if (!own(variant, 'ring')) merged.ring = 0;
    if (!own(variant, 'packageLabel')) merged.packageLabel = '';
    if (!own(variant, 'packageCount')) merged.packageCount = 1;
    if (!own(variant, 'retailerLinks')) merged.retailerLinks = [];
    if (!own(variant, 'stock')) merged.stock = 'unknown';
    if (!own(variant, 'stockChecked')) merged.stockChecked = '';
    if (!own(variant, 'priceChecked')) merged.priceChecked = '';
    if (!own(variant, 'priceNote')) merged.priceNote = '';
    if (!own(variant, 'smokeTime')) merged.smokeTime = '';
    if (!own(variant, 'practicalLines')) merged.practicalLines = [];
  }

  // A variant with no verified price must not inherit the parent's: that would price one
  // vitola at another's figure. It carries no price, and Value reads as unrated.
  if (variant.priceUnverified) {
    merged.price = 0;
    merged.packagePrice = 0;
    merged.priceUnverified = true;
  } else {
    merged.priceUnverified = false;
  }
  merged.activeVariantId = variant.id;
  merged.defaultVariantId = defaultVariantId(base);
  return { record: merged, variant, variantId: variant.id, variants };
}

// Promoting the active size to the saved default. Returns a patch rather than mutating, so
// the caller decides whether it reaches KV.
export function promoteVariantPatch(record, variantId) {
  const resolved = resolveVariantId(record, variantId);
  if (!resolved) return null;
  if (resolved === defaultVariantId(record)) return null;
  return { defaultVariantId: resolved };
}


function boundedScore(value, min = 1, max = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function normaliseBlendVariant(input, index = 0) {
  const raw = input && typeof input === 'object' ? input : {};
  const label = text(raw.label || raw.name || raw.blend).trim();
  const id = variantSlug(raw.id || label);
  if (!id) return null;
  void index;

  const packageCount = Math.max(1, Math.round(finite(raw.packageCount, 1)));
  const price = perStickPrice(raw);
  const variant = {
    id,
    label: label || id,
    priceUnverified: !(price > 0),
    packageCount
  };

  if (raw.title) variant.title = text(raw.title).trim();
  if (raw.eyebrow) variant.eyebrow = text(raw.eyebrow).trim();
  if (finite(raw.length, 0) > 0) variant.length = finite(raw.length);
  if (finite(raw.ring, 0) > 0) variant.ring = Math.round(finite(raw.ring));
  if (raw.packageLabel) variant.packageLabel = text(raw.packageLabel).trim();
  if (finite(raw.packagePrice, 0) > 0) variant.packagePrice = finite(raw.packagePrice);
  if (price > 0) variant.price = price;
  if (Array.isArray(raw.retailerLinks)) {
    variant.retailerLinks = raw.retailerLinks.map(link => text(link).trim()).filter(Boolean);
  }
  if (['in', 'out', 'unknown'].includes(raw.stock)) variant.stock = raw.stock;
  if (raw.smokeTime) variant.smokeTime = text(raw.smokeTime).trim();
  if (text(raw.imageUrl).startsWith('/')) variant.imageUrl = text(raw.imageUrl);
  if (raw.summaryHtml) variant.summaryHtml = text(raw.summaryHtml);
  if (own(raw, 'noteHtml')) variant.noteHtml = text(raw.noteHtml);
  if (Array.isArray(raw.practicalLines)) {
    variant.practicalLines = raw.practicalLines.map(line => text(line).trim()).filter(Boolean);
  }
  if (Array.isArray(raw.productionLines)) {
    variant.productionLines = raw.productionLines.map(line => text(line).trim()).filter(Boolean);
  }
  if (Array.isArray(raw.experienceTags)) {
    variant.experienceTags = raw.experienceTags.map(line => text(line).trim()).filter(Boolean);
  }
  if (raw.priceNote) variant.priceNote = text(raw.priceNote).trim();
  if (raw.priceChecked) variant.priceChecked = text(raw.priceChecked).trim();
  if (raw.stockChecked) variant.stockChecked = text(raw.stockChecked).trim();
  if (raw.country) variant.country = text(raw.country).trim();

  const strength = boundedScore(raw.strength);
  const quality = boundedScore(raw.quality);
  const risk = boundedScore(raw.risk, 1, 3);
  if (strength !== null) variant.strength = strength;
  if (quality !== null) variant.quality = quality;
  if (risk !== null) variant.risk = risk;
  if (own(raw, 'flavour')) {
    const flavour = raw.flavour === null || raw.flavour === '' ? null : boundedScore(raw.flavour);
    variant.flavour = flavour;
  }

  if (['gold', 'silver', 'bronze'].includes(raw.size)) variant.size = raw.size;
  else if (variant.ring) variant.size = sizeTierForRing(variant.ring);

  if (Array.isArray(raw.sizeVariants)) {
    variant.sizeVariants = normaliseVariants(raw);
    variant.defaultVariantId = defaultVariantId(raw);
  }
  return variant;
}

export function normaliseBlendVariants(record) {
  const list = Array.isArray(record?.blendVariants) ? record.blendVariants : [];
  const seen = new Set();
  const output = [];
  for (const [index, raw] of list.entries()) {
    const variant = normaliseBlendVariant(raw, index);
    if (!variant || seen.has(variant.id)) continue;
    seen.add(variant.id);
    output.push(variant);
  }
  return output;
}

export function defaultBlendVariantId(record) {
  const variants = normaliseBlendVariants(record);
  if (!variants.length) return '';
  const saved = variantSlug(record?.defaultBlendVariantId);
  return variants.some(variant => variant.id === saved) ? saved : variants[0].id;
}

export function resolveBlendVariantId(record, requestedId = '') {
  const variants = normaliseBlendVariants(record);
  if (!variants.length) return '';
  const requested = variantSlug(requestedId);
  return variants.some(variant => variant.id === requested) ? requested : defaultBlendVariantId(record);
}

export function blendEffectiveRecord(record, requestedId = '') {
  const base = record && typeof record === 'object' ? record : {};
  const variants = normaliseBlendVariants(base);
  if (!variants.length) {
    return { record: { ...base }, blendVariant: null, blendVariantId: '', blendVariants: [] };
  }

  const blendVariantId = resolveBlendVariantId(base, requestedId);
  const blendVariant = variants.find(item => item.id === blendVariantId) || variants[0];
  const merged = { ...base };
  const isSavedDefault = blendVariant.id === defaultBlendVariantId(base);

  // The parent fields describe the saved/default blend. An alternate blend must not borrow
  // tobacco, ratings, tasting copy, stock or sizes just because its own data omitted them.
  if (!isSavedDefault) {
    merged.length = 0;
    merged.ring = 0;
    merged.packageLabel = '';
    merged.packageCount = 1;
    merged.price = 0;
    merged.packagePrice = 0;
    merged.retailerLinks = [];
    merged.stock = 'unknown';
    merged.stockChecked = '';
    merged.priceChecked = '';
    merged.priceNote = '';
    merged.smokeTime = '';
    merged.practicalLines = [];
    merged.productionLines = [];
    merged.experienceTags = [];
    merged.summaryHtml = '';
    merged.noteHtml = '';
    merged.strength = 0;
    merged.quality = 0;
    merged.flavour = null;
    merged.sizeVariants = [];
    merged.defaultVariantId = '';
  }

  for (const field of BLEND_VARIANT_FIELDS) {
    if (own(blendVariant, field)) merged[field] = blendVariant[field];
  }

  if (!isSavedDefault && blendVariant.priceUnverified) {
    merged.price = 0;
    merged.packagePrice = 0;
    merged.priceUnverified = true;
  } else {
    merged.priceUnverified = false;
  }

  merged.activeBlendVariantId = blendVariant.id;
  merged.defaultBlendVariantId = defaultBlendVariantId(base);
  return {
    record: merged,
    blendVariant,
    blendVariantId: blendVariant.id,
    blendVariants: variants
  };
}

export function promoteBlendVariantPatch(record, blendVariantId) {
  const resolved = resolveBlendVariantId(record, blendVariantId);
  if (!resolved) return null;
  if (resolved === defaultBlendVariantId(record)) return null;
  return { defaultBlendVariantId: resolved };
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'of', 'no', 'nr', 'cigar', 'cigars']);

function queryTokens(value) {
  return text(value).toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map(token => token.trim())
    .filter(token => token && !STOPWORDS.has(token));
}

function haystack(parts) {
  return queryTokens(parts.filter(Boolean).join(' '));
}

// Searching a vitola by name resolves to the entry that holds it plus the size to select,
// so a size never needs its own catalogue card to be findable.
export function matchVariantQuery(query, records = []) {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  const results = [];

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const key = text(record.key);
    if (!key) continue;
    const parentWords = haystack([record.brand, record.title, key.replace(/-/g, ' ')]);
    const blends = normaliseBlendVariants(record);
    const blendCandidates = blends.length
      ? blends.map(blend => {
        const effective = blendEffectiveRecord(record, blend.id).record;
        return {
          blendVariantId: blend.id,
          blend,
          effective,
          blendWords: haystack([blend.label, blend.title])
        };
      })
      : [{ blendVariantId: '', blend: null, effective: record, blendWords: [] }];

    for (const blendCandidate of blendCandidates) {
      const sizes = normaliseVariants(blendCandidate.effective);
      const sizeCandidates = sizes.length
        ? sizes.map(variant => ({
          variantId: variant.id,
          sizeWords: haystack([variant.label, variant.title])
        }))
        : [{ variantId: '', sizeWords: [] }];

      for (const sizeCandidate of sizeCandidates) {
        const words = new Set([
          ...parentWords,
          ...blendCandidate.blendWords,
          ...sizeCandidate.sizeWords
        ]);
        const matched = tokens.filter(token =>
          words.has(token) || [...words].some(word => word.startsWith(token)));
        if (matched.length !== tokens.length) continue;
        const specificity = [...blendCandidate.blendWords, ...sizeCandidate.sizeWords]
          .filter(word => tokens.includes(word)).length;
        results.push({
          key,
          blendVariantId: blendCandidate.blendVariantId,
          variantId: sizeCandidate.variantId,
          matched: matched.length,
          specificity
        });
      }
    }
  }

  const best = new Map();
  for (const result of results) {
    const current = best.get(result.key);
    if (!current || result.specificity > current.specificity) best.set(result.key, result);
  }
  return [...best.values()].sort((a, b) =>
    b.specificity - a.specificity || a.key.localeCompare(b.key));
}

export function resolveSearchQuery(query, records = []) {
  return matchVariantQuery(query, records)[0] || null;
}
