import { deriveValue } from './catalogue-value.mjs';
import { deriveAutoLaurel, normaliseFlavour } from './catalogue-flavour.mjs';
import { registerCatalogueStateResponseListener } from './catalogue-save-pipeline.mjs';

const STATE_API = '/api/catalogue-overrides';
let state = { version: 3, cards: {}, sections: {}, entries: {} };
let refreshTimer = 0;
let previewTimer = 0;

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatAUD(value) {
  const number = Math.max(0, finite(value));
  return `A$${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(2)}`;
}

function ratingNode(card, label) {
  return Array.from(card?.querySelectorAll?.('.rating') || []).find(node =>
    node.querySelector?.(':scope > span')?.textContent?.trim().toLowerCase() === String(label).toLowerCase()
  ) || null;
}

function ratingScore(card, label, fallback = 0) {
  const text = ratingNode(card, label)?.querySelector?.('.subscore')?.textContent || '';
  const match = text.match(/(\d+)\s*\/\s*10/);
  return match ? Number(match[1]) : fallback;
}

function ratingTier(card, label, fallback = 'bronze') {
  const node = ratingNode(card, label);
  if (!node) return fallback;
  if (node.classList.contains('gold')) return 'gold';
  if (node.classList.contains('silver')) return 'silver';
  return 'bronze';
}

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function setValueVisual(card, value) {
  const node = ratingNode(card, 'Value');
  if (!node) return;
  const score = Math.max(1, Math.min(10, Math.round(finite(value, 1))));
  node.classList.remove('gold', 'silver', 'bronze', 'score-high', 'score-mid', 'score-low');
  const tier = score >= 7 ? 'gold' : score >= 5 ? 'silver' : 'bronze';
  const scoreClass = score >= 8 ? 'score-high' : score >= 5 ? 'score-mid' : 'score-low';
  node.classList.add(tier, scoreClass);
  const medal = node.querySelector('.medal');
  if (medal) medal.className = `medal ${tier}`;
  setText(node.querySelector('b'), tier[0].toUpperCase() + tier.slice(1));
  let small = node.querySelector('.subscore');
  if (!small) {
    small = document.createElement('small');
    small.className = 'subscore';
    node.appendChild(small);
  }
  setText(small, `${score}/10`);
  card.dataset.value = String(score >= 7 ? 3 : score >= 5 ? 2 : 1);
}

function dimensionsFromCard(card, saved = {}) {
  const artframe = card?.querySelector?.('.artframe');
  let length = own(saved, 'length') ? finite(saved.length) : finite(artframe?.dataset?.visualLength);
  let ring = own(saved, 'ring') ? finite(saved.ring) : finite(artframe?.dataset?.visualRing);
  if (!(length > 0) || !(ring > 0)) {
    const sizeText = Array.from(card?.querySelectorAll?.('.facts b') || [])
      .map(node => node.textContent || '')
      .find(text => /\d+(?:\.\d+)?\s*[″"]\s*[×x]\s*\d+/i.test(text)) || '';
    const match = sizeText.match(/(\d+(?:\.\d+)?)\s*[″"]\s*[×x]\s*(\d+)/i);
    if (match) {
      if (!(length > 0)) length = Number(match[1]);
      if (!(ring > 0)) ring = Number(match[2]);
    }
  }
  return { length, ring };
}

function cardValueInputs(card, saved = {}) {
  const { length, ring } = dimensionsFromCard(card, saved);
  return {
    price: own(saved, 'price') ? Math.max(0, finite(saved.price)) : Math.max(0, finite(card?.dataset?.price)),
    quality: own(saved, 'quality') ? Math.max(1, Math.min(10, Math.round(finite(saved.quality, 5)))) : ratingScore(card, 'Quality', 5),
    flavour: own(saved, 'flavour') ? normaliseFlavour(saved.flavour) : normaliseFlavour(ratingScore(card, 'Flavour', null)),
    length,
    ring,
    catalogueType: saved.catalogueType || card?.dataset?.catalogueType || '',
    valueUnit: saved.valueUnit || card?.dataset?.valueUnit || ''
  };
}

function applyLaurelKind(card, kind) {
  const existingAward = card.querySelector('.gem-award');
  const current = card.classList.contains('gem-laurel') ? 'gem' : card.classList.contains('crown-laurel') ? 'crown' : 'none';
  if (current === kind && ((kind === 'none' && !existingAward) || (kind !== 'none' && existingAward))) return;
  const selector = kind === 'gem' ? '.gem-award.gem-tier' : kind === 'crown' ? '.gem-award.crown-tier' : '';
  const template = selector ? document.querySelector(selector)?.cloneNode(true) : null;
  card.querySelectorAll('.gem-award').forEach(node => node.remove());
  card.classList.remove('crown-laurel', 'gem-laurel');
  if (kind === 'none') return;
  card.classList.add(kind === 'gem' ? 'gem-laurel' : 'crown-laurel');
  const medals = card.querySelector('.medals');
  if (template && medals) medals.insertAdjacentElement('beforebegin', template);
}

function refreshLaurel(card, saved, value) {
  let kind = String(saved.laurel || 'auto').toLowerCase();
  if (!['auto', 'none', 'crown', 'gem'].includes(kind)) kind = 'auto';
  if (kind === 'auto') {
    const strength = own(saved, 'strength') ? finite(saved.strength, 0) : ratingScore(card, 'Strength', 0);
    const quality = own(saved, 'quality') ? finite(saved.quality, 0) : ratingScore(card, 'Quality', 0);
    const flavour = own(saved, 'flavour') ? saved.flavour : null;
    const size = saved.size || ratingTier(card, 'Size', 'bronze');
    kind = deriveAutoLaurel({ key: card.dataset.key, strength, quality, flavour, size, value });
  }
  applyLaurelKind(card, kind);
}

export function refreshSizeAdjustedValueForCard(card, saved = null) {
  if (!card) return null;
  const cardSaved = saved || state.cards?.[card.dataset.key] || {};
  const input = cardValueInputs(card, cardSaved);
  const result = deriveValue(input.price, input.quality, input.flavour, {
    length: input.length,
    ring: input.ring,
    catalogueType: input.catalogueType,
    valueUnit: input.valueUnit
  });

  setValueVisual(card, result.score);
  card.dataset.expected = String(result.benchmark);
  card.dataset.ratio = Number.isFinite(result.ratio) ? result.ratio.toFixed(2) : '';
  card.dataset.valueSizeFactor = result.sizeFactor.toFixed(4);
  card.dataset.valueSessionPrice = result.sessionPrice.toFixed(2);
  card.dataset.valueSessionLength = String(result.sessionLength || '');
  card.dataset.valueSessionRing = String(result.sessionRing || '');

  const row = card.querySelector('.value-calc');
  if (row) {
    row.classList.remove('gold', 'silver', 'bronze');
    row.classList.add(result.score >= 7 ? 'gold' : result.score >= 5 ? 'silver' : 'bronze');
    const priceLabel = result.split ? 'Session' : 'Actual';
    row.innerHTML = `<span>Q${input.quality} benchmark <b>${formatAUD(result.benchmark)}</b></span><span>${priceLabel} <b>${formatAUD(result.sessionPrice)}</b></span><span>Size <b>×${result.sizeFactor.toFixed(2)}</b> · Ratio <b>${Number.isFinite(result.ratio) ? result.ratio.toFixed(2) : '—'}×</b></span>`;
  }

  refreshLaurel(card, cardSaved, result.score);
  return result;
}

export function refreshAllSizeAdjustedValues() {
  refreshTimer = 0;
  document.querySelectorAll('article.card[data-key]').forEach(card => {
    refreshSizeAdjustedValueForCard(card, state.cards?.[card.dataset.key] || {});
  });
}

function scheduleRefresh(delay = 20) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshAllSizeAdjustedValues, delay);
}

function selectedKey() {
  const selected = document.getElementById('catalogue-admin-card')?.value || '';
  if (selected && !selected.startsWith('__v139_')) return selected;
  const draft = document.getElementById('catalogue-v139-key')?.value || '';
  return String(draft).trim().toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export function previewSizeAdjustedValue() {
  previewTimer = 0;
  const price = Math.max(0, finite(document.getElementById('catalogue-v139-price')?.value));
  const quality = Math.max(1, Math.min(10, Math.round(finite(document.getElementById('catalogue-admin-quality')?.value, 1))));
  const flavour = normaliseFlavour(document.getElementById('catalogue-admin-flavour')?.value);
  const length = Math.max(0, finite(document.getElementById('catalogue-v139-length')?.value));
  const ring = Math.max(0, finite(document.getElementById('catalogue-v139-ring')?.value));
  const catalogueType = document.getElementById('catalogue-v139-type')?.value || '';
  const key = selectedKey();
  const saved = state.cards?.[key] || {};
  const result = deriveValue(price, quality, flavour, {
    length,
    ring,
    catalogueType,
    valueUnit: saved.valueUnit || ''
  });

  const valueInput = document.getElementById('catalogue-admin-value');
  if (valueInput) valueInput.value = String(result.score);
  const detail = document.getElementById('catalogue-admin-value-detail');
  if (detail) {
    const unitNote = result.split ? `Half-session ${formatAUD(result.sessionPrice)} · ` : '';
    const flavourNote = result.flavourMultiplier < 1 && flavour !== null ? ` · Flavour ×${result.flavourMultiplier.toFixed(2)}` : '';
    detail.textContent = `${unitNote}Q${quality} benchmark ${formatAUD(result.benchmark)} · base ${Number.isFinite(result.baseRatio) ? result.baseRatio.toFixed(2) : '—'}×${flavourNote} · Size ×${result.sizeFactor.toFixed(2)} · adjusted ${Number.isFinite(result.ratio) ? result.ratio.toFixed(2) : '—'}×`;
  }

  const card = key && globalThis.CSS?.escape
    ? document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`)
    : null;
  if (card) {
    refreshSizeAdjustedValueForCard(card, {
      ...saved,
      price,
      quality,
      flavour,
      length,
      ring,
      catalogueType
    });
  }
  return result;
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(previewSizeAdjustedValue, 20);
}

function bindEvents() {
  document.addEventListener('input', event => {
    if (['catalogue-admin-flavour', 'catalogue-admin-quality', 'catalogue-v139-price', 'catalogue-v139-length', 'catalogue-v139-ring'].includes(event.target?.id)) schedulePreview();
  });
  document.addEventListener('change', event => {
    if (['catalogue-admin-card', 'catalogue-admin-flavour', 'catalogue-admin-quality', 'catalogue-v139-price', 'catalogue-v139-length', 'catalogue-v139-ring', 'catalogue-v139-type'].includes(event.target?.id)) schedulePreview();
  });
}

function installStateListener() {
  registerCatalogueStateResponseListener('size-value', event => {
    if (!event?.state || typeof event.state !== 'object') return;
    if (event.method === 'GET' || event.method === 'HEAD') state = event.state;
    else if (event.method === 'PUT') state = { ...state, cards: event.state.cards || state.cards || {} };
    scheduleRefresh();
    schedulePreview();
  });
}

async function loadState() {
  try {
    const response = await fetch(STATE_API, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (response.ok) {
      const payload = await response.json();
      if (payload && typeof payload === 'object') state = payload;
    }
  } catch (_) {}
  scheduleRefresh();
  schedulePreview();
}

export function initSizeValueRuntime() {
  installStateListener();
  bindEvents();
  scheduleRefresh();
  loadState();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSizeValueRuntime, { once: true });
  else initSizeValueRuntime();
}
