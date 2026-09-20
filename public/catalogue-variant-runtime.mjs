// Selecting a size on a card, without changing what the catalogue shows by default.
//
// Two ideas are kept apart deliberately. The default variant is saved state: it is what a
// reader sees first and only an admin changes it. The active variant is a view: picking a
// size rewrites the card in place and is forgotten on reload. Selecting a size therefore
// never writes to KV, and promoting one is an explicit, separate action.

import {
  blendEffectiveRecord,
  defaultBlendVariantId,
  defaultVariantId,
  normaliseBlendVariants,
  normaliseVariants,
  promoteBlendVariantPatch,
  promoteVariantPatch,
  resolveSearchQuery,
  variantEffectiveRecord
} from './catalogue-variants.mjs?v=blend-variants-1';
import { refreshSizeAdjustedValueForCard } from './catalogue-size-value-runtime.mjs?v=flavour-weight-1';
import { applySizeRatingToCard } from './catalogue-size-presentation.mjs';
import { ensureFlavourRating, refreshLaurelForCard } from './catalogue-flavour.mjs?v=flavour-weight-1';

export const VARIANT_QUERY_PARAM = 'variant';
export const BLEND_QUERY_PARAM = 'blend';
export const STATE_API = '/api/catalogue-overrides';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const aud = value => `A$${Number(value).toFixed(2).replace(/\.00$/, '')}`;

function storedRecord(state, key) {
  const card = state?.cards?.[key];
  const entry = state?.entries?.[key];
  if (!card && !entry) return null;
  return { key, ...(card || {}), ...(entry || {}) };
}

// Catalogue keys are already restricted to lowercase letters, digits, hyphen and
// underscore, so a quote guard is all the escaping they need. The platform escape helper
// is absent in some environments this module runs in, and reaching for it failed the
// whole runtime there rather than just that one lookup.
function cardSelector(key) {
  return 'article.card[data-key="' + String(key).replace(/["\\]/g, '\\$&') + '"]';
}

function retailerLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0]
      .replace(/(^|[-_])(\w)/g, (_all, sep, letter) => (sep ? ' ' : '') + letter.toUpperCase());
  } catch {
    return 'retailer';
  }
}

function applyVariantFreshness(card, effective) {
  const status = ['in', 'out', 'unknown'].includes(effective.stock) ? effective.stock : 'unknown';
  card.dataset.stock = status;
  if (effective.priceChecked) card.dataset.priceChecked = effective.priceChecked;
  else delete card.dataset.priceChecked;
  if (effective.stockChecked) card.dataset.stockChecked = effective.stockChecked;
  else delete card.dataset.stockChecked;

  const row = card.querySelector('.freshness');
  if (!row) return;
  row.classList.remove('live-stock-in', 'live-stock-out', 'live-stock-unknown', 'live-stock-delisted');
  row.classList.add(`live-stock-${status}`);

  const retailer = Array.isArray(effective.retailerLinks) && effective.retailerLinks.length
    ? retailerLabel(effective.retailerLinks[0])
    : 'retailer';
  const stockState = row.querySelector('.stock-state');
  if (stockState) {
    stockState.textContent = status === 'in'
      ? `In stock at ${retailer}`
      : status === 'out'
        ? `Out of stock at ${retailer}`
        : 'Stock status unconfirmed';
  }
  const priceState = row.querySelector('.price-checked-state');
  if (priceState) priceState.textContent = effective.priceChecked
    ? `Price checked ${effective.priceChecked}`
    : 'Price not yet checked';
  const stockCheckedState = row.querySelector('.stock-checked-state');
  if (stockCheckedState) stockCheckedState.textContent = effective.stockChecked
    ? `Stock checked ${effective.stockChecked}`
    : 'Stock not yet checked';
}

function announceVariantChange(card, resolved) {
  const EventCtor = card?.ownerDocument?.defaultView?.CustomEvent;
  if (!EventCtor) return;
  card.dispatchEvent(new EventCtor('catalogue:variant-changed', {
    bubbles: true,
    detail: {
      key: card.dataset.key || '',
      variantId: resolved.variantId,
      defaultVariantId: card.dataset.defaultVariant || '',
      stock: card.dataset.stock || 'unknown'
    }
  }));
}

function replaceShopLinks(card, links) {
  const existing = [...card.querySelectorAll('a.shop[href]')];
  const body = card.querySelector('.cardbody');
  if (!body) return;
  existing.forEach(node => node.remove());
  links.forEach((url, index) => {
    const anchor = document.createElement('a');
    anchor.className = 'shop';
    anchor.href = url;
    anchor.rel = 'noopener';
    anchor.target = '_blank';
    if (index) anchor.style.marginTop = '8px';
    anchor.innerHTML = `View at ${retailerLabel(url)} <span>↗</span>`;
    body.appendChild(anchor);
  });
}

// Every field a vitola can legitimately change, written into the card that is already on
// screen. The ratings are not written here: they are recomputed from the fields below by
// the modules that already own them, so a variant cannot carry a stale score.

function ratingNode(card, label) {
  return [...(card?.querySelectorAll?.('.rating') || [])]
    .find(node => (node.querySelector(':scope > span')?.textContent || '').trim() === label) || null;
}

function applyNumericRating(card, label, value, datasetName) {
  const score = Number(value);
  const node = ratingNode(card, label);
  if (!node || !Number.isFinite(score) || score <= 0) return;
  const rounded = Math.max(1, Math.min(10, Math.round(score)));
  const tier = rounded >= 7 ? 'gold' : rounded >= 5 ? 'silver' : 'bronze';
  const scoreClass = rounded >= 8 ? 'score-high' : rounded >= 5 ? 'score-mid' : 'score-low';
  node.classList.remove('gold', 'silver', 'bronze', 'score-high', 'score-mid', 'score-low');
  node.classList.add(tier, scoreClass);
  const medal = node.querySelector('.medal');
  if (medal) medal.className = `medal ${tier}`;
  const bold = node.querySelector('b');
  if (bold) bold.textContent = tier[0].toUpperCase() + tier.slice(1);
  let small = node.querySelector('.subscore');
  if (!small) {
    small = document.createElement('small');
    small.className = 'subscore';
    node.appendChild(small);
  }
  small.textContent = `${rounded}/10`;
  if (datasetName) card.dataset[datasetName] = String(rounded >= 7 ? 3 : rounded >= 5 ? 2 : 1);
}

function replaceMetaLines(card, selector, lines) {
  const host = card.querySelector(selector);
  if (!host) return;
  const heading = host.querySelector('.artmeta-title')?.cloneNode(true);
  host.replaceChildren();
  if (heading) host.appendChild(heading);
  for (const line of Array.isArray(lines) ? lines : []) {
    const span = document.createElement('span');
    span.className = 'artmeta-line';
    span.textContent = line;
    host.appendChild(span);
  }
}

function syncExperienceTags(card, tags) {
  card.querySelector('.tag-groups')?.remove();
  if (!Array.isArray(tags) || !tags.length) return;
  const medals = card.querySelector('.medals');
  if (!medals) return;
  const groups = document.createElement('div');
  groups.className = 'tag-groups';
  const group = document.createElement('div');
  group.className = 'tag-group';
  const label = document.createElement('span');
  label.className = 'tag-label';
  label.textContent = 'Experience';
  const items = document.createElement('div');
  items.className = 'tag-items';
  for (const tag of tags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    items.appendChild(chip);
  }
  group.append(label, items);
  groups.appendChild(group);
  medals.insertAdjacentElement('afterend', groups);
}

function syncNote(card, html) {
  let note = card.querySelector('p.mog-note');
  if (!html) {
    note?.remove();
    return;
  }
  if (!note) {
    note = document.createElement('p');
    note.className = 'mog-note';
    const summary = card.querySelector('p.summary');
    if (summary) summary.insertAdjacentElement('afterend', note);
    else card.querySelector('.cardbody')?.appendChild(note);
  }
  note.innerHTML = html;
}

function linesFromStoredMarkup(markup) {
  if (typeof markup !== 'string' || !markup.trim()) return [];
  const host = document.createElement('div');
  host.innerHTML = markup;
  const nodes = [...host.querySelectorAll('.artmeta-line')];
  if (nodes.length) return nodes.map(node => node.textContent.trim()).filter(Boolean);
  return host.textContent.split(/\n+/).map(line => line.trim()).filter(Boolean);
}

function syncBlendSelector(card, key, record, activeId = '') {
  const variants = normaliseBlendVariants(record);
  if (variants.length < 2) return;
  let host = card.querySelector('.blend-variants');
  if (!host) {
    host = document.createElement('div');
    host.className = 'blend-variants';
    card.querySelector('h3')?.insertAdjacentElement('afterend', host);
  }
  host.dataset.blendVariantCount = String(variants.length);
  let select = host.querySelector('[data-blend-select]');
  if (!select) {
    const label = document.createElement('label');
    label.className = 'blend-variant-label';
    label.htmlFor = `blend-variant-${key}`;
    label.textContent = 'Blend';
    select = document.createElement('select');
    select.className = 'blend-variant-select';
    select.id = `blend-variant-${key}`;
    select.dataset.blendSelect = key;
    host.append(label, select);
  }
  const wanted = variants.map(item => item.id).join('|');
  const current = [...select.options].map(option => option.value).join('|');
  if (wanted !== current) {
    select.replaceChildren(...variants.map(variant => {
      const option = document.createElement('option');
      option.value = variant.id;
      option.textContent = variant.label;
      return option;
    }));
  }
  select.value = variants.some(item => item.id === activeId)
    ? activeId
    : defaultBlendVariantId(record);
  bindSelects(card);
}

function syncSizeSelector(card, key, record, activeId = '') {
  const variants = normaliseVariants(record);
  let host = card.querySelector('.size-variants');
  if (variants.length < 2) {
    if (host) host.hidden = true;
    return;
  }

  if (!host) {
    host = document.createElement('div');
    host.className = 'size-variants';
    const blendHost = card.querySelector('.blend-variants');
    const title = card.querySelector('h3');
    if (blendHost) blendHost.insertAdjacentElement('afterend', host);
    else title?.insertAdjacentElement('afterend', host);
  }
  host.hidden = false;
  host.dataset.variantCount = String(variants.length);
  let select = host.querySelector('[data-variant-select]');
  if (!select) {
    const label = document.createElement('label');
    label.className = 'size-variant-label';
    label.htmlFor = `size-variant-${key}`;
    label.textContent = 'Size';
    select = document.createElement('select');
    select.className = 'size-variant-select';
    select.id = `size-variant-${key}`;
    select.dataset.variantSelect = key;
    host.append(label, select);
  }
  const wanted = variants.map(item => item.id).join('|');
  const current = [...select.options].map(option => option.value).join('|');
  if (wanted !== current) {
    select.replaceChildren(...variants.map(variant => {
      const option = document.createElement('option');
      option.value = variant.id;
      option.textContent = variant.label;
      if (variant.priceUnverified) option.dataset.priceUnverified = '1';
      return option;
    }));
  }
  select.value = variants.some(item => item.id === activeId)
    ? activeId
    : defaultVariantId(record);
  bindSelects(card);
}

function applyBlendPresentation(card, effective) {
  replaceMetaLines(card, '.artmeta-left', effective.productionLines);
  applyNumericRating(card, 'Strength', effective.strength, 'strength');
  applyNumericRating(card, 'Quality', effective.quality, 'quality');
  ensureFlavourRating(card, effective.flavour ?? null);
  syncExperienceTags(card, effective.experienceTags);
  syncNote(card, effective.noteHtml || '');

  const country = card.querySelector('.country-name');
  if (country && effective.country) country.textContent = effective.country;
  if (Number.isFinite(Number(effective.risk))) card.dataset.risk = String(effective.risk);

  refreshSizeAdjustedValueForCard(card, effective);
  refreshLaurelForCard(card, effective);
  markUnratedValue(card, Boolean(effective.priceUnverified), effective.quality);
}

export function applyBlendToCard(card, record, blendVariantId, sizeVariantId = '') {
  if (!card || !record) return null;
  const blendResolved = blendEffectiveRecord(record, blendVariantId);
  if (!blendResolved.blendVariant) return null;
  const blended = { ...blendResolved.record };
  if (!Array.isArray(blended.productionLines) && typeof blended.productionHtml === 'string') {
    blended.productionLines = linesFromStoredMarkup(blended.productionHtml);
  }
  if (!Array.isArray(blended.practicalLines) && typeof blended.practicalHtml === 'string') {
    blended.practicalLines = linesFromStoredMarkup(blended.practicalHtml);
  }
  const sizes = normaliseVariants(blended);

  syncBlendSelector(card, card.dataset.key || '', record, blendResolved.blendVariantId);
  card.dataset.activeBlend = blendResolved.blendVariantId;
  card.dataset.defaultBlend = blended.defaultBlendVariantId || '';
  const blendSelect = card.querySelector('[data-blend-select]');
  if (blendSelect && blendSelect.value !== blendResolved.blendVariantId) {
    blendSelect.value = blendResolved.blendVariantId;
  }

  syncSizeSelector(card, card.dataset.key || '', blended, sizeVariantId);
  let resolvedSize = null;
  if (sizes.length) {
    resolvedSize = applyVariantToCard(
      card,
      blended,
      sizes.some(item => item.id === sizeVariantId) ? sizeVariantId : defaultVariantId(blended)
    );
  } else {
    const syntheticId = '__selected_blend__';
    const synthetic = {
      ...blended,
      id: syntheticId,
      label: blendResolved.blendVariant.label || 'Blend'
    };
    resolvedSize = applyVariantToCard(card, {
      ...blended,
      sizeVariants: [synthetic],
      defaultVariantId: syntheticId
    }, syntheticId);
    delete card.dataset.activeVariant;
    delete card.dataset.defaultVariant;
  }

  const effective = resolvedSize?.record || blended;
  applyBlendPresentation(card, effective);
  return {
    ...blendResolved,
    record: effective,
    variant: resolvedSize?.variant || null,
    variantId: sizes.length ? (resolvedSize?.variantId || '') : ''
  };
}

export function applyVariantToCard(card, record, variantId) {
  if (!card || !record) return null;
  const resolved = variantEffectiveRecord(record, variantId);
  if (!resolved.variant) return null;
  const effective = resolved.record;

  card.dataset.activeVariant = resolved.variantId;
  card.dataset.defaultVariant = effective.defaultVariantId || '';

  const title = card.querySelector('h3');
  if (title && effective.title) {
    const brand = title.querySelector('span')?.outerHTML || '';
    title.innerHTML = `${brand}${effective.title}`;
  }

  // The eyebrow keeps its rank prefix, which belongs to the entry, and takes the selected
  // size's caption after it.
  const eyebrow = card.querySelector('.eyebrow');
  if (eyebrow && effective.eyebrow) {
    const current = eyebrow.textContent || '';
    const dash = current.indexOf('—');
    eyebrow.textContent = dash >= 0
      ? `${current.slice(0, dash + 1)} ${effective.eyebrow}`
      : effective.eyebrow;
  }

  // Practical describes handling, which changes with the size: the cadence band follows the
  // ring gauge and the package line follows how that size is sold.
  if (Array.isArray(effective.practicalLines) && effective.practicalLines.length) {
    const practical = card.querySelector('.artmeta-right');
    if (practical) {
      const heading = practical.querySelector('.artmeta-title')?.outerHTML || '';
      practical.innerHTML = heading + effective.practicalLines
        .map(line => `<span class="artmeta-line">${line}</span>`).join('');
    }
  }

  const art = card.querySelector('.artframe');
  if (art) {
    if (effective.length > 0) art.dataset.visualLength = String(effective.length);
    if (effective.ring > 0) art.dataset.visualRing = String(effective.ring);
    const length = Number(art.dataset.visualLength) || 1;
    const ring = Number(art.dataset.visualRing) || 1;
    art.style.setProperty('--visual-footprint',
      String(Math.max(0.32, Math.min(1.15, (length / 5) * (ring / 50)))));
    if (effective.imageUrl && String(effective.imageUrl).startsWith('/')) {
      let img = art.querySelector('img');
      if (!img) { img = document.createElement('img'); art.prepend(img); }
      img.src = effective.imageUrl;
    }
  }

  const facts = card.querySelectorAll('.facts > div');
  if (facts.length >= 3) {
    const unpriced = Boolean(effective.priceUnverified);
    facts[0].querySelector('b').textContent = unpriced ? '—' : aud(effective.packagePrice);
    facts[0].querySelector('small').textContent = effective.packageLabel || 'single cigar';
    facts[1].querySelector('b').textContent = unpriced ? '—' : aud(effective.price);
    if (effective.length > 0 && effective.ring > 0) {
      facts[2].querySelector('b').textContent = `${effective.length}″ × ${Math.round(effective.ring)}`;
    }
  }

  if (Array.isArray(effective.retailerLinks)) replaceShopLinks(card, effective.retailerLinks);
  applyVariantFreshness(card, effective);

  if (own(effective, 'smokeTime')) {
    const bottom = card.querySelector('.artmeta-bottom');
    if (bottom) bottom.textContent = effective.smokeTime || '';
  }

  const summary = card.querySelector('p.summary');
  if (summary && effective.summaryHtml) summary.innerHTML = effective.summaryHtml;
  const note = card.querySelector('p.mog-note');
  if (note && own(effective, 'noteHtml')) note.innerHTML = effective.noteHtml || '';

  card.dataset.price = effective.priceUnverified ? '' : String(effective.price);
  if (effective.priceUnverified) card.dataset.priceUnverified = '1';
  else delete card.dataset.priceUnverified;

  const select = card.querySelector('[data-variant-select]');
  if (select && select.value !== resolved.variantId) select.value = resolved.variantId;

  // Size, Value, the laurel and the overall score all follow from the fields just written,
  // through the modules that already own them. Nothing about a rating is stored per variant.
  applySizeRatingToCard(card, effective.ring);
  refreshSizeAdjustedValueForCard(card, effective);
  refreshLaurelForCard(card, effective);
  markUnratedValue(card, Boolean(effective.priceUnverified), effective.quality);
  announceVariantChange(card, resolved);
  return resolved;
}

// The Value medal after a refresh that had no price to work with. Left alone, it would read
// Bronze 1/10, which is a verdict the catalogue has not made.
export function markUnratedValue(card, unrated, quality) {
  const rating = [...card.querySelectorAll('.rating')]
    .find(node => (node.querySelector(':scope > span')?.textContent || '').trim() === 'Value');
  const row = card.querySelector('.value-calc');
  if (!rating) return;
  rating.classList.toggle('value-unrated', unrated);
  if (row) row.classList.toggle('value-unrated', unrated);
  const label = rating.querySelector('b');
  const subscore = rating.querySelector('.subscore');
  if (unrated) {
    if (label) label.textContent = 'Unrated';
    if (subscore) subscore.textContent = 'No AU price';
    rating.querySelector('.medal')?.classList.add('value-unrated-medal');
    card.dataset.value = '';
    if (row) {
      const middle = row.querySelectorAll('span')[1];
      if (middle) middle.textContent = 'No verified AU price for this size';
      const ratio = row.querySelectorAll('span')[2];
      if (ratio) ratio.innerHTML = 'Ratio <b>—</b>';
    }
  } else {
    rating.querySelector('.medal')?.classList.remove('value-unrated-medal');
  }
  void quality;
}

let liveState = null;

export function setVariantState(state) {
  liveState = state;
}

export function cardRecord(key) {
  return storedRecord(liveState, key);
}

export function preserveViewport(work) {
  const view = typeof window !== 'undefined' ? window : null;
  if (!view || typeof work !== 'function') return work?.();
  const x = Number(view.scrollX) || 0;
  const y = Number(view.scrollY) || 0;
  const result = work();
  const restore = () => {
    if (Math.abs((Number(view.scrollX) || 0) - x) > 0.5 || Math.abs((Number(view.scrollY) || 0) - y) > 0.5) {
      view.scrollTo?.(x, y);
    }
  };
  restore();
  view.requestAnimationFrame?.(() => {
    restore();
    view.requestAnimationFrame?.(restore);
  });
  return result;
}

export function selectVariant(key, variantId, { updateUrl = true, preserveScroll = true } = {}) {
  const card = document.querySelector(cardSelector(key));
  const record = storedRecord(liveState, key);
  if (!card || !record) return null;
  const apply = () => {
    const activeBlend = card.dataset.activeBlend || defaultBlendVariantId(record);
    const blended = activeBlend ? blendEffectiveRecord(record, activeBlend).record : record;
    const resolved = applyVariantToCard(card, blended, variantId);
    if (!resolved) return null;
    if (updateUrl) writeVariantToUrl(key, resolved.variantId, record);
    return resolved;
  };
  return preserveScroll ? preserveViewport(apply) : apply();
}

export function selectBlend(key, blendVariantId, { updateUrl = true, preserveScroll = true } = {}) {
  const card = document.querySelector(cardSelector(key));
  const record = storedRecord(liveState, key);
  if (!card || !record) return null;
  const apply = () => {
    const resolved = applyBlendToCard(card, record, blendVariantId);
    if (!resolved) return null;
    if (updateUrl) writeBlendToUrl(key, resolved.blendVariantId, resolved.variantId, record);
    return resolved;
  };
  return preserveScroll ? preserveViewport(apply) : apply();
}

// A selected size is addressable without becoming its own catalogue card. The parameter is
// dropped again when the selection is just the saved default, so a shared link stays clean.
export function writeVariantToUrl(key, variantId, record) {
  try {
    const card = document.querySelector(cardSelector(key));
    const activeBlend = card?.dataset.activeBlend || defaultBlendVariantId(record);
    const blended = activeBlend ? blendEffectiveRecord(record, activeBlend).record : record;
    const url = new URL(window.location.href);
    if (!variantId || variantId === defaultVariantId(blended)) {
      url.searchParams.delete(VARIANT_QUERY_PARAM);
    } else {
      url.searchParams.set(VARIANT_QUERY_PARAM, `${key}:${variantId}`);
    }
    window.history.replaceState({}, '', url);
  } catch { /* history is a convenience here, never a requirement */ }
}

export function writeBlendToUrl(key, blendVariantId, variantId, record) {
  try {
    const url = new URL(window.location.href);
    if (!blendVariantId || blendVariantId === defaultBlendVariantId(record)) {
      url.searchParams.delete(BLEND_QUERY_PARAM);
    } else {
      url.searchParams.set(BLEND_QUERY_PARAM, `${key}:${blendVariantId}`);
    }
    const blended = blendVariantId ? blendEffectiveRecord(record, blendVariantId).record : record;
    if (!variantId || variantId === defaultVariantId(blended)) {
      url.searchParams.delete(VARIANT_QUERY_PARAM);
    } else {
      url.searchParams.set(VARIANT_QUERY_PARAM, `${key}:${variantId}`);
    }
    window.history.replaceState({}, '', url);
  } catch { /* history is a convenience here, never a requirement */ }
}

export function readBlendFromUrl(href = window.location.href) {
  try {
    const raw = new URL(href).searchParams.get(BLEND_QUERY_PARAM) || '';
    const [key, blendVariantId] = raw.split(':');
    return key && blendVariantId ? { key, blendVariantId } : null;
  } catch {
    return null;
  }
}

export function readVariantFromUrl(href = window.location.href) {
  try {
    const raw = new URL(href).searchParams.get(VARIANT_QUERY_PARAM) || '';
    const [key, variantId] = raw.split(':');
    return key && variantId ? { key, variantId } : null;
  } catch {
    return null;
  }
}

// Searching a vitola opens the entry that holds it with that size selected, so a size is
// findable without a duplicate card carrying its name.
export function openSearchResult(query) {
  const records = Object.keys({ ...(liveState?.cards || {}), ...(liveState?.entries || {}) })
    .map(key => storedRecord(liveState, key))
    .filter(Boolean);
  const hit = resolveSearchQuery(query, records);
  if (!hit) return null;
  const card = document.querySelector(cardSelector(hit.key));
  if (hit.blendVariantId) selectBlend(hit.key, hit.blendVariantId);
  if (hit.variantId) selectVariant(hit.key, hit.variantId);
  // Scrolling is a courtesy; a host without it should still select the size and highlight.
  card?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  card?.classList.add('search-hit');
  setTimeout(() => card?.classList.remove('search-hit'), 2400);
  return hit;
}

// Promoting the active size to the saved default. This is the only path here that writes.
export async function promoteActiveVariant(key, { fetchImpl = fetch } = {}) {
  const card = document.querySelector(cardSelector(key));
  const record = storedRecord(liveState, key);
  if (!card || !record) return null;
  const patch = promoteVariantPatch(record, card.dataset.activeVariant || '');
  if (!patch) return null;

  const response = await fetchImpl(STATE_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cards: { [key]: patch }, entries: { [key]: patch } })
  });
  if (!response?.ok) throw new Error(`Could not save the default size (HTTP ${response?.status}).`);

  if (liveState?.cards?.[key]) liveState.cards[key].defaultVariantId = patch.defaultVariantId;
  if (liveState?.entries?.[key]) liveState.entries[key].defaultVariantId = patch.defaultVariantId;
  card.dataset.defaultVariant = patch.defaultVariantId;
  writeVariantToUrl(key, patch.defaultVariantId, storedRecord(liveState, key));
  return patch;
}

export async function promoteActiveBlend(key, { fetchImpl = fetch } = {}) {
  const card = document.querySelector(cardSelector(key));
  const record = storedRecord(liveState, key);
  if (!card || !record) return null;
  const patch = promoteBlendVariantPatch(record, card.dataset.activeBlend || '');
  if (!patch) return null;

  const response = await fetchImpl(STATE_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cards: { [key]: patch }, entries: { [key]: patch } })
  });
  if (!response?.ok) throw new Error(`Could not save the default blend (HTTP ${response?.status}).`);

  if (liveState?.cards?.[key]) liveState.cards[key].defaultBlendVariantId = patch.defaultBlendVariantId;
  if (liveState?.entries?.[key]) liveState.entries[key].defaultBlendVariantId = patch.defaultBlendVariantId;
  card.dataset.defaultBlend = patch.defaultBlendVariantId;
  writeBlendToUrl(key, patch.defaultBlendVariantId, card.dataset.activeVariant || '', storedRecord(liveState, key));
  return patch;
}

function ensureStyle() {
  if (document.getElementById('catalogue-variant-style')) return;
  const style = document.createElement('style');
  style.id = 'catalogue-variant-style';
  style.textContent = `
.size-variants,.blend-variants{display:flex;align-items:center;gap:7px;margin:0 0 8px;overflow-anchor:none}
.size-variant-label,.blend-variant-label{font-family:Cinzel,serif;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8a6b34}
.size-variant-select,.blend-variant-select{flex:1 1 auto;min-width:0;max-width:230px;border:1px solid rgba(195,162,80,.5);border-radius:7px;background:rgba(255,250,240,.85);color:#5b321d;font:600 12px Georgia,serif;padding:4px 7px}
.size-variant-select:focus,.blend-variant-select:focus{outline:1px solid #c69d2c;border-color:#c69d2c}
.rating.value-unrated{opacity:.68}
.rating.value-unrated .value-unrated-medal{filter:grayscale(1);opacity:.38}
.rating.value-unrated b,.rating.value-unrated .subscore{color:inherit;opacity:.72}
.value-calc.value-unrated{opacity:.78}
article.card.search-hit{outline:2px solid #c69d2c;outline-offset:3px}
.catalogue-variant-default{margin-left:6px;border:1px solid rgba(195,162,80,.5);border-radius:6px;background:rgba(255,250,240,.7);color:#6c4a0d;font:700 10px Cinzel,serif;letter-spacing:.06em;text-transform:uppercase;padding:3px 7px;cursor:pointer}
.catalogue-variant-default[disabled]{opacity:.45;cursor:default}
.catalogue-variant-search{display:flex;flex-direction:column;gap:4px;margin:0 0 12px}
.catalogue-variant-search-label{font-family:Cinzel,serif;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8a6b34}
.catalogue-variant-search input{box-sizing:border-box;width:100%;border:1px solid rgba(195,162,80,.5);border-radius:7px;background:rgba(255,250,240,.85);color:#5b321d;font:13px Georgia,serif;padding:6px 9px}
.catalogue-variant-search input:focus{outline:1px solid #c69d2c;border-color:#c69d2c}
.catalogue-variant-search-status{color:#8a7a60;font-size:10.5px;min-height:13px}
@media(max-width:900px){.size-variant-select{max-width:none}.blend-variant-select{max-width:none}}
`;
  document.head.appendChild(style);
}

function bindSelects(root = document) {
  root.querySelectorAll?.('[data-variant-select]').forEach(select => {
    if (select.dataset.variantBound === '1') return;
    select.dataset.variantBound = '1';
    select.addEventListener('change', () => {
      selectVariant(select.dataset.variantSelect, select.value, { preserveScroll:true });
    });
  });
  root.querySelectorAll?.('[data-blend-select]').forEach(select => {
    if (select.dataset.blendBound === '1') return;
    select.dataset.blendBound = '1';
    select.addEventListener('change', () => {
      selectBlend(select.dataset.blendSelect, select.value, { preserveScroll:true });
    });
  });
}

// The admin control lives beside the selector rather than in the editor panel, because the
// size it promotes is the one on screen.
function bindAdminDefaultButtons(root = document) {
  if (!document.getElementById('catalogue-admin-panel')) return;

  root.querySelectorAll?.('.size-variants').forEach(host => {
    if (host.hidden || host.querySelector('.catalogue-variant-default')) return;
    const select = host.querySelector('[data-variant-select]');
    if (!select) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalogue-variant-default';
    button.textContent = 'Make default';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const saved = await promoteActiveVariant(select.dataset.variantSelect);
        button.textContent = saved ? 'Default saved' : 'Already default';
      } catch (error) {
        button.textContent = error.message || 'Save failed';
      }
      setTimeout(() => { button.textContent = 'Make default'; button.disabled = false; }, 2200);
    });
    host.appendChild(button);
  });

  root.querySelectorAll?.('.blend-variants').forEach(host => {
    if (host.querySelector('.catalogue-blend-default')) return;
    const select = host.querySelector('[data-blend-select]');
    if (!select) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalogue-variant-default catalogue-blend-default';
    button.textContent = 'Make default';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const saved = await promoteActiveBlend(select.dataset.blendSelect);
        button.textContent = saved ? 'Default saved' : 'Already default';
      } catch (error) {
        button.textContent = error.message || 'Save failed';
      }
      setTimeout(() => { button.textContent = 'Make default'; button.disabled = false; }, 2200);
    });
    host.appendChild(button);
  });
}

export function ensureVariantSearch(root = document) {
  if (root.getElementById?.('catalogue-variant-search')) return root.getElementById('catalogue-variant-search');
  const host = root.getElementById?.('catalogue-sidebar-extra-controls')
    || root.querySelector?.('.controls')
    || root.body;
  if (!host) return null;

  const section = root.createElement('div');
  section.id = 'catalogue-variant-search';
  section.className = 'catalogue-variant-search';
  const label = root.createElement('label');
  label.className = 'catalogue-variant-search-label';
  label.setAttribute('for', 'catalogue-variant-search-input');
  label.textContent = 'Find a cigar, blend or size';
  const input = root.createElement('input');
  input.id = 'catalogue-variant-search-input';
  input.type = 'search';
  input.placeholder = 'e.g. Liga No 9 Petit Corona or Maduro';
  input.autocomplete = 'off';
  const status = root.createElement('small');
  status.className = 'catalogue-variant-search-status';

  const run = () => {
    const query = input.value.trim();
    if (!query) { status.textContent = ''; return; }
    const hit = openSearchResult(query);
    status.textContent = hit
      ? `Opened ${hit.key}${hit.blendVariantId ? ` · ${hit.blendVariantId.replace(/-/g, ' ')}` : ''}${hit.variantId ? ` · ${hit.variantId.replace(/-/g, ' ')}` : ''}`
      : 'No match';
  };
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); run(); } });
  input.addEventListener('search', run);

  section.append(label, input, status);
  host.prepend(section);
  return section;
}

export function applyAllVariants() {
  document.querySelectorAll('article.card[data-key]').forEach(card => {
    const record = storedRecord(liveState, card.dataset.key);
    if (!record) return;
    const blends = normaliseBlendVariants(record);
    if (blends.length > 1) {
      applyBlendToCard(card, record, card.dataset.activeBlend || defaultBlendVariantId(record));
      return;
    }
    if (normaliseVariants(record).length >= 1) {
      applyVariantToCard(card, record, card.dataset.activeVariant || defaultVariantId(record));
    }
  });

  const requestedBlend = readBlendFromUrl();
  if (requestedBlend) selectBlend(requestedBlend.key, requestedBlend.blendVariantId, { updateUrl: false });
  const requestedVariant = readVariantFromUrl();
  if (requestedVariant) selectVariant(requestedVariant.key, requestedVariant.variantId, { updateUrl: false });
}

export async function initVariantRuntime({ fetchImpl = fetch } = {}) {
  ensureStyle();
  try {
    const response = await fetchImpl(`${STATE_API}?variants=${Date.now()}`, { cache: 'no-store' });
    if (response?.ok) setVariantState(await response.json());
  } catch { /* a card without state still renders its saved default from the server */ }
  ensureVariantSearch();
  bindSelects();
  bindAdminDefaultButtons();
  applyAllVariants();
  const observer = new MutationObserver(() => { bindSelects(); bindAdminDefaultButtons(); });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== 'undefined' && !globalThis.__CATALOGUE_VARIANT_TEST__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initVariantRuntime(); });
  } else {
    initVariantRuntime();
  }
}
