// Selecting a size on a card, without changing what the catalogue shows by default.
//
// Two ideas are kept apart deliberately. The default variant is saved state: it is what a
// reader sees first and only an admin changes it. The active variant is a view: picking a
// size rewrites the card in place and is forgotten on reload. Selecting a size therefore
// never writes to KV, and promoting one is an explicit, separate action.

import {
  defaultVariantId,
  normaliseVariants,
  promoteVariantPatch,
  resolveSearchQuery,
  variantEffectiveRecord
} from './catalogue-variants.mjs?v=size-variants-1';
import { refreshSizeAdjustedValueForCard } from './catalogue-size-value-runtime.mjs?v=flavour-weight-1';
import { applySizeRatingToCard } from './catalogue-size-presentation.mjs';
import { refreshLaurelForCard } from './catalogue-flavour.mjs?v=flavour-weight-1';

export const VARIANT_QUERY_PARAM = 'variant';
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

export function selectVariant(key, variantId, { updateUrl = true } = {}) {
  const card = document.querySelector(cardSelector(key));
  const record = storedRecord(liveState, key);
  if (!card || !record) return null;
  const resolved = applyVariantToCard(card, record, variantId);
  if (!resolved) return null;
  if (updateUrl) writeVariantToUrl(key, resolved.variantId, record);
  return resolved;
}

// A selected size is addressable without becoming its own catalogue card. The parameter is
// dropped again when the selection is just the saved default, so a shared link stays clean.
export function writeVariantToUrl(key, variantId, record) {
  try {
    const url = new URL(window.location.href);
    if (!variantId || variantId === defaultVariantId(record)) {
      url.searchParams.delete(VARIANT_QUERY_PARAM);
    } else {
      url.searchParams.set(VARIANT_QUERY_PARAM, `${key}:${variantId}`);
    }
    window.history.replaceState({}, '', url);
  } catch { /* history is a convenience here, never a requirement */ }
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

function ensureStyle() {
  if (document.getElementById('catalogue-variant-style')) return;
  const style = document.createElement('style');
  style.id = 'catalogue-variant-style';
  style.textContent = `
.size-variants{display:flex;align-items:center;gap:7px;margin:0 0 8px}
.size-variant-label{font-family:Cinzel,serif;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8a6b34}
.size-variant-select{flex:1 1 auto;min-width:0;max-width:230px;border:1px solid rgba(195,162,80,.5);border-radius:7px;background:rgba(255,250,240,.85);color:#5b321d;font:600 12px Georgia,serif;padding:4px 7px}
.size-variant-select:focus{outline:1px solid #c69d2c;border-color:#c69d2c}
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
@media(max-width:900px){.size-variant-select{max-width:none}}
`;
  document.head.appendChild(style);
}

function bindSelects(root = document) {
  root.querySelectorAll?.('[data-variant-select]').forEach(select => {
    if (select.dataset.variantBound === '1') return;
    select.dataset.variantBound = '1';
    select.addEventListener('change', () => {
      selectVariant(select.dataset.variantSelect, select.value);
    });
  });
}

// The admin control lives beside the selector rather than in the editor panel, because the
// size it promotes is the one on screen.
function bindAdminDefaultButtons(root = document) {
  if (!document.getElementById('catalogue-admin-panel')) return;
  root.querySelectorAll?.('.size-variants').forEach(host => {
    if (host.querySelector('.catalogue-variant-default')) return;
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
}

// A search box, because a vitola that only exists as a size inside another entry is
// otherwise unreachable by name. It mounts into the sidebar's control host when there is
// one and falls back to the top of the catalogue.
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
  label.textContent = 'Find a cigar or size';
  const input = root.createElement('input');
  input.id = 'catalogue-variant-search-input';
  input.type = 'search';
  input.placeholder = 'e.g. Liga No 9 Petit Corona';
  input.autocomplete = 'off';
  const status = root.createElement('small');
  status.className = 'catalogue-variant-search-status';

  const run = () => {
    const query = input.value.trim();
    if (!query) { status.textContent = ''; return; }
    const hit = openSearchResult(query);
    status.textContent = hit
      ? `Opened ${hit.key}${hit.variantId ? ` · ${hit.variantId.replace(/-/g, ' ')}` : ''}`
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
    if (!record || normaliseVariants(record).length < 2) return;
    applyVariantToCard(card, record, card.dataset.activeVariant || defaultVariantId(record));
  });
  const requested = readVariantFromUrl();
  if (requested) selectVariant(requested.key, requested.variantId, { updateUrl: false });
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
