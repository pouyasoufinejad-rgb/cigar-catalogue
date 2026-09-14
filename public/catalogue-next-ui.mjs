import { deriveValue } from './catalogue-value.mjs';
import { hasQualityAwardException } from './catalogue-rating-exceptions.mjs';
import {
  brandGroups,
  catalogueTypeOf,
  mergedCatalogueSource,
  mergeSparseCardPatch,
  moveRankedCohort,
  moveRecommendationEntry,
  recommendationLocation,
  editablePatch
} from './catalogue-next-model.mjs';

const STATE_API = '/api/catalogue-overrides';
const IMAGE_API = '/api/catalogue-image/';
const STOCK_API = '/api/stock';
const ADMIN_TOKEN_SESSION_KEY = 'cigar-catalogue-admin-token';
const PERSONAL_STORAGE_KEY = 'cigar-catalogue-convenience-v1';
const ROOT_ID = 'catalogue-next-root';
const STYLE_ID = 'catalogue-next-style-v1';
const UI_VERSION = '20260915-smokingpipes-rebuild-v1';

let activeContext = null;
let adminTokenMemory = '';

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampScore(value, fallback = 5) {
  return Math.max(1, Math.min(10, Math.round(finite(value, fallback))));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), globalThis.location?.origin || 'https://example.invalid');
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (String(value || '').startsWith('/')) return `${url.pathname}${url.search}${url.hash}`;
    return url.toString();
  } catch (_) {
    return '';
  }
}

function sanitiseDisplayMarkup(value) {
  if (typeof document === 'undefined') return String(value || '');
  const template = document.createElement('template');
  template.innerHTML = String(value || '');
  template.content.querySelectorAll('script,style,iframe,object,embed,svg,math,link,meta').forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach(node => {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  });
  return template.innerHTML;
}

function formatAUD(value) {
  const number = Math.max(0, finite(value));
  return `A$${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(2)}`;
}

function titleFromLegacyCard(card) {
  const h3 = card?.querySelector?.('h3');
  if (!h3) return '';
  const cloneNode = h3.cloneNode?.(true);
  cloneNode?.querySelector?.('span')?.remove?.();
  return String(cloneNode?.textContent || h3.textContent || '').trim();
}

function ratingNode(card, label) {
  return [...(card?.querySelectorAll?.('.rating') || [])].find(node =>
    String(node.querySelector?.(':scope > span')?.textContent || '').trim().toLowerCase() === String(label).toLowerCase()
  ) || null;
}

function ratingScore(card, label, fallback = null) {
  const text = String(ratingNode(card, label)?.querySelector?.('.subscore')?.textContent || '');
  const match = text.match(/(\d+)\s*\/\s*10/);
  return match ? Number(match[1]) : fallback;
}

function ratingTier(card, label, fallback = 'bronze') {
  const node = ratingNode(card, label);
  if (!node) return fallback;
  if (node.classList?.contains?.('gold')) return 'gold';
  if (node.classList?.contains?.('silver')) return 'silver';
  return 'bronze';
}

function bodyMarkupWithoutTitle(card, selector) {
  const node = card?.querySelector?.(selector);
  if (!node) return '';
  return [...(node.children || [])]
    .filter(child => !child.classList?.contains?.('artmeta-title'))
    .map(child => child.outerHTML || escapeHtml(child.textContent || ''))
    .join('');
}

function experienceTagsFromCard(card) {
  const group = [...(card?.querySelectorAll?.('.tag-group') || [])].find(node =>
    String(node.querySelector?.('.tag-label')?.textContent || '').trim().toLowerCase() === 'experience'
  );
  return group ? [...group.querySelectorAll('.tag-chip')].map(node => String(node.textContent || '').trim()).filter(Boolean) : [];
}

function parseSizeFromLegacyCard(card) {
  const facts = card?.querySelectorAll?.('.facts > div') || [];
  const sizeText = String(facts[2]?.querySelector?.('b')?.textContent || '');
  const match = sizeText.match(/([\d.]+)\s*″?\s*[×x]\s*(\d+)/i);
  const art = card?.querySelector?.('.artframe');
  return {
    length: finite(art?.dataset?.visualLength, match ? Number(match[1]) : 0),
    ring: Math.round(finite(art?.dataset?.visualRing, match ? Number(match[2]) : 0))
  };
}

function numberFromText(value, fallback = 0) {
  const match = String(value || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function stripEyebrowDecorations(value) {
  return String(value || '')
    .replace(/^\s*(?:T\d+|Taster|No\.\s*\d+|Archived)\s*[—–-]\s*/i, '')
    .replace(/^\s*[●•]\s*/, '')
    .trim();
}

export function seedFromLegacyCard(card) {
  const key = String(card?.dataset?.key || '').trim();
  const facts = card?.querySelectorAll?.('.facts > div') || [];
  const size = parseSizeFromLegacyCard(card);
  const image = card?.querySelector?.('.artframe img');
  const brand = String(card?.querySelector?.('h3 span')?.textContent || '').trim();
  return {
    key,
    brand,
    title: titleFromLegacyCard(card),
    eyebrow: stripEyebrowDecorations(card?.querySelector?.('.eyebrow')?.textContent || ''),
    summaryHtml: card?.querySelector?.('.summary')?.innerHTML || '',
    noteHtml: card?.querySelector?.('.mog-note')?.innerHTML || '',
    packagePrice: numberFromText(facts[0]?.querySelector?.('b')?.textContent, finite(card?.dataset?.price)),
    packageLabel: String(facts[0]?.querySelector?.('small')?.textContent || 'single cigar').trim(),
    price: finite(card?.dataset?.price, numberFromText(facts[1]?.querySelector?.('b')?.textContent)),
    country: String(card?.querySelector?.('.country-name')?.textContent || 'Unknown').trim(),
    length: size.length,
    ring: size.ring,
    strength: ratingScore(card, 'Strength', 5),
    flavour: ratingScore(card, 'Flavour', null),
    quality: ratingScore(card, 'Quality', 5),
    size: ratingTier(card, 'Size', 'bronze'),
    risk: Math.max(1, Math.min(3, Math.round(finite(card?.dataset?.risk, 1)))),
    stock: String(card?.dataset?.stock || 'unknown').trim().toLowerCase(),
    stockPin: String(card?.dataset?.stockPin || '').trim().toLowerCase(),
    rank: Math.max(1, Math.round(finite(card?.dataset?.rank, 1))),
    catalogueType: String(card?.dataset?.catalogueType || (card?.dataset?.taster === '1' ? 'taster' : 'main')).trim().toLowerCase(),
    taster: card?.dataset?.taster === '1',
    archived: card?.dataset?.archived === '1',
    archivedAt: String(card?.dataset?.archivedAt || ''),
    experienceTags: experienceTagsFromCard(card),
    productionHtml: bodyMarkupWithoutTitle(card, '.artmeta-left'),
    practicalHtml: bodyMarkupWithoutTitle(card, '.artmeta-right'),
    smokeTime: String(card?.querySelector?.('.artmeta-bottom')?.textContent || '').trim(),
    retailerLinks: [...(card?.querySelectorAll?.('a.shop[href]') || [])].map(link => link.href).filter(Boolean),
    imageUrl: image?.getAttribute?.('src') || '',
    imageAlt: image?.getAttribute?.('alt') || `${brand} ${titleFromLegacyCard(card)}`.trim(),
    imageScale: finite(card?.dataset?.imageScale, 1),
    imageObjectPosition: String(card?.dataset?.imageObjectPosition || 'center').trim()
  };
}

function captureLegacySeeds(root = document) {
  const seeds = {};
  [...(root?.querySelectorAll?.('article.card[data-key]') || [])].forEach(card => {
    const seed = seedFromLegacyCard(card);
    if (seed.key && !seeds[seed.key]) seeds[seed.key] = seed;
  });
  return seeds;
}

function linesToMarkup(lines) {
  return Array.isArray(lines) ? lines.map(line => `<div>${escapeHtml(line)}</div>`).join('') : '';
}

function effectiveStock(source = {}) {
  const pin = String(source.stockPin || '').toLowerCase();
  if (pin === 'in' || pin === 'out') return pin;
  if (pin === 'hold') return 'unknown';
  const stock = String(source.stock || 'unknown').toLowerCase();
  return ['in', 'out', 'delisted'].includes(stock) ? stock : 'unknown';
}

function imageUrlForSource(source = {}) {
  const url = String(source.imageUrl || '').trim();
  return url || (source.imageSourceKey ? `${IMAGE_API}${encodeURIComponent(source.imageSourceKey)}?v=${Number(source.imageVersion) || 0}` : '');
}

function rowsFromStateAndSeeds(state = {}, seeds = {}, stockResults = {}, imagePreviews = new Map()) {
  const keys = new Set([
    ...Object.keys(record(seeds)),
    ...Object.keys(record(state?.entries)),
    ...Object.keys(record(state?.cards))
  ]);
  const rows = [];
  for (const key of keys) {
    const seed = record(seeds[key]);
    const source = mergedCatalogueSource(key, state, seeds);
    const stockResult = record(stockResults?.[key]);
    const type = catalogueTypeOf(source);
    const price = Math.max(0, finite(source.price, finite(seed.price)));
    const quality = clampScore(source.quality, clampScore(seed.quality));
    const flavour = source.flavour === null || source.flavour === '' || source.flavour === undefined
      ? (seed.flavour === null || seed.flavour === undefined ? null : clampScore(seed.flavour))
      : clampScore(source.flavour);
    const valueResult = deriveValue(price, quality, flavour);
    const stock = stockResult.status || effectiveStock(source);
    rows.push({
      ...seed,
      ...source,
      key,
      catalogueType: type,
      taster: type === 'taster',
      archived: Boolean(source.archived),
      price,
      quality,
      strength: clampScore(source.strength, clampScore(seed.strength)),
      flavour,
      risk: Math.max(1, Math.min(3, Math.round(finite(source.risk, finite(seed.risk, 1))))),
      length: Math.max(0, finite(source.length, finite(seed.length))),
      ring: Math.max(0, Math.round(finite(source.ring, finite(seed.ring)))),
      stock,
      rank: Math.max(1, Math.round(finite(source.rank, finite(seed.rank, 1)))),
      valueScore: valueResult.score,
      valueBenchmark: valueResult.benchmark,
      valueRatio: valueResult.ratio,
      productionHtml: own(source, 'productionHtml') ? source.productionHtml : (Array.isArray(source.productionLines) ? linesToMarkup(source.productionLines) : seed.productionHtml || ''),
      practicalHtml: own(source, 'practicalHtml') ? source.practicalHtml : (Array.isArray(source.practicalLines) ? linesToMarkup(source.practicalLines) : seed.practicalHtml || ''),
      imageUrl: imagePreviews.get(key) || imageUrlForSource(source) || seed.imageUrl || '',
      imageScale: Math.max(.35, Math.min(2.5, finite(source.imageScale, finite(seed.imageScale, 1)))),
      imageObjectPosition: String(source.imageObjectPosition || seed.imageObjectPosition || 'center')
    });
  }
  return rows;
}

function unavailable(row) {
  return Boolean(row?.archived) || ['out', 'delisted'].includes(String(row?.stock || '').toLowerCase());
}

export function sectionPlanForRows(rowsInput = [], state = {}) {
  const rows = Array.isArray(rowsInput) ? rowsInput : [];
  const byKey = new Map(rows.map(row => [row.key, row]));
  const unavailableKeys = rows.filter(unavailable).map(row => row.key);
  const unavailableSet = new Set(unavailableKeys);
  const recommendations = [];
  const used = new Set();
  if (Array.isArray(state?.recommendationSubsections)) {
    for (const subsection of state.recommendationSubsections) {
      const keys = (Array.isArray(subsection?.entryKeys) ? subsection.entryKeys : [])
        .filter(key => byKey.has(key) && catalogueTypeOf(byKey.get(key)) === 'main' && !unavailableSet.has(key));
      keys.forEach(key => used.add(key));
      recommendations.push({
        id: String(subsection?.id || ''),
        name: String(subsection?.name || subsection?.id || 'Recommendations'),
        description: String(subsection?.description || ''),
        keys
      });
    }
  }
  const fallbackMain = rows
    .filter(row => catalogueTypeOf(row) === 'main' && !unavailable(row) && !used.has(row.key))
    .sort((a, b) => finite(a.rank, 9999) - finite(b.rank, 9999))
    .map(row => row.key);
  if (!recommendations.length || fallbackMain.length) {
    recommendations.push({ id: 'other-recommendations', name: recommendations.length ? 'Other Recommendations' : 'Recommendations', description: '', keys: fallbackMain });
  }
  const half = rows
    .filter(row => catalogueTypeOf(row) === 'half' && !unavailable(row))
    .sort((a,b) => finite(a.rank,9999) - finite(b.rank,9999))
    .map(row => row.key);
  const tasters = rows
    .filter(row => catalogueTypeOf(row) === 'taster' && !unavailable(row))
    .sort((a,b) => finite(a.rank,9999) - finite(b.rank,9999))
    .map(row => row.key);
  return { recommendations, half, tasters, unavailable: unavailableKeys };
}

export function shouldResetInitialScroll(locationLike = globalThis?.location) {
  return !String(locationLike?.hash || '');
}

export function resolveEditableField(targetLike = {}) {
  return String(targetLike?.field || targetLike?.dataset?.catalogueEditable || '').trim();
}

const CARD_INSPECTOR_FIELDS = [
  { name:'brand', label:'Brand', type:'text' },
  { name:'title', label:'Product / vitola', type:'text' },
  { name:'eyebrow', label:'Eyebrow', type:'text' },
  { name:'summaryHtml', label:'Summary', type:'textarea' },
  { name:'noteHtml', label:'Note', type:'textarea' },
  { name:'packagePrice', label:'Package price A$', type:'number', step:'0.01' },
  { name:'packageLabel', label:'Package label', type:'text' },
  { name:'price', label:'Per-stick price A$', type:'number', step:'0.01' },
  { name:'country', label:'Country', type:'text' },
  { name:'length', label:'Length (inches)', type:'number', step:'0.05' },
  { name:'ring', label:'Ring gauge', type:'number', step:'1' },
  { name:'strength', label:'Strength /10', type:'number', min:'1', max:'10' },
  { name:'flavour', label:'Flavour /10 (blank = unrated)', type:'number', min:'1', max:'10', allowBlank:true },
  { name:'quality', label:'Quality /10', type:'number', min:'1', max:'10' },
  { name:'risk', label:'Risk', type:'select', options:[['1','Low'],['2','Moderate'],['3','High']] },
  { name:'stockPin', label:'Stock pin', type:'select', options:[['','Automatic'],['in','In stock'],['out','Out of stock'],['hold','Hold current']] },
  { name:'catalogueType', label:'Catalogue type', type:'select', options:[['main','Recommendation'],['half','Half-Cigar'],['taster','Taster']] },
  { name:'retailerLinks', label:'Retailer URLs', type:'textarea' },
  { name:'smokeTime', label:'Smoke time', type:'text' },
  { name:'experienceTags', label:'Experience tags', type:'textarea' },
  { name:'productionHtml', label:'Production', type:'textarea' },
  { name:'practicalHtml', label:'Practical', type:'textarea' },
  { name:'laurel', label:'Laurel', type:'select', options:[['auto','Automatic'],['none','None'],['crown','Crown'],['gem','Gem']] },
  { name:'archived', label:'Archived', type:'checkbox' }
];

export function inspectorFieldsForTarget(target = 'card') {
  if (target === 'card') return CARD_INSPECTOR_FIELDS.map(field => ({ ...field }));
  if (target === 'value') return [
    { name:'value', label:'Value', type:'number', readOnly:true },
    { name:'price', label:'Per-stick price A$', type:'number', step:'0.01' },
    { name:'quality', label:'Quality /10', type:'number', min:'1', max:'10' },
    { name:'flavour', label:'Flavour /10 (blank = unrated)', type:'number', min:'1', max:'10', allowBlank:true }
  ];
  if (target === 'size') return CARD_INSPECTOR_FIELDS.filter(field => ['length','ring'].includes(field.name));
  if (target === 'image') return [
    { name:'imageFile', label:'Replace image', type:'file' },
    { name:'imageScale', label:'Image scale', type:'number', step:'0.05', min:'0.35', max:'2.5' },
    { name:'imageObjectPosition', label:'Image position', type:'text' }
  ];
  if (target === 'rank') return [{ name:'rank', label:'Position', type:'number', min:'1', step:'1' }];
  const field = CARD_INSPECTOR_FIELDS.find(item => item.name === target);
  return field ? [{ ...field }] : [];
}

export function buildDraftSavePayload(baseState = {}, draftState = {}) {
  const source = clone(record(draftState)) || {};
  const payload = {
    version: Number(source.version) >= 4 && Array.isArray(source.recommendationSubsections) ? 4 : 3,
    cards: clone(record(source.cards)) || {},
    entries: clone(record(source.entries)) || {},
    sections: clone(record(source.sections)) || {}
  };
  if (payload.version >= 4) payload.recommendationSubsections = clone(source.recommendationSubsections) || [];
  for (const card of Object.values(payload.cards)) if (record(card)) delete card.value;
  return payload;
}

function readAdminToken() {
  if (adminTokenMemory) return adminTokenMemory;
  try { adminTokenMemory = sessionStorage.getItem(ADMIN_TOKEN_SESSION_KEY) || ''; }
  catch (_) { adminTokenMemory = ''; }
  return adminTokenMemory;
}

function clearAdminToken() {
  adminTokenMemory = '';
  try { sessionStorage.removeItem(ADMIN_TOKEN_SESSION_KEY); } catch (_) {}
}

function requireAdminToken() {
  const existing = readAdminToken();
  if (existing) return existing;
  const token = String(globalThis.prompt?.('Admin token required to change the catalogue.') || '').trim();
  if (!token) throw new Error('Admin token is required to save catalogue changes.');
  adminTokenMemory = token;
  try { sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, token); } catch (_) {}
  return token;
}

async function adminWriteFetch(url, options = {}) {
  const token = requireAdminToken();
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) clearAdminToken();
  return response;
}

function readPersonalStatuses() {
  try {
    const state = JSON.parse(localStorage.getItem(PERSONAL_STORAGE_KEY) || '{}');
    return record(state.statuses);
  } catch (_) { return {}; }
}

function writePersonalStatus(key, name, enabled) {
  try {
    const state = JSON.parse(localStorage.getItem(PERSONAL_STORAGE_KEY) || '{}');
    const statuses = record(state.statuses);
    const prior = record(statuses[key]);
    statuses[key] = { owned:false, tried:false, want:false, rebuy:false, ...prior, [name]: Boolean(enabled) };
    localStorage.setItem(PERSONAL_STORAGE_KEY, JSON.stringify({ ...record(state), statuses }));
  } catch (_) {}
}

function retailerLabel(urlValue) {
  try {
    const host = new URL(urlValue).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('cigarhut.com.au')) return 'Cigarhut';
    if (host.includes('cigarworld.com.au')) return 'Cigarworld';
    if (host.includes('cigarbox.com.au')) return 'CigarBox';
    if (host.includes('firmincigars.com.au')) return 'Firmin Cigars';
    if (host.includes('theindexcigars.com.au')) return 'The Index';
    if (host.includes('sydneycigarhouse')) return 'Sydney Cigar House';
    if (host.includes('corporatecigar')) return 'Corporate Cigar';
    return host;
  } catch (_) { return 'Retailer'; }
}

function scoreTier(value) {
  const score = finite(value, 0);
  return score >= 7 ? 'gold' : score >= 5 ? 'silver' : 'bronze';
}

function derivedSize(row) {
  const length = finite(row?.length);
  const ring = finite(row?.ring);
  if (length >= 4 && ring >= 32) return 'gold';
  if (length >= 4 && ring >= 28) return 'silver';
  return 'bronze';
}

function derivedLaurel(row) {
  let requested = String(row?.laurel || 'auto').toLowerCase();
  if (['none','crown','gem'].includes(requested)) return requested;
  const golds = [
    finite(row?.strength) >= 7,
    finite(row?.quality) >= 7,
    row?.flavour !== null && row?.flavour !== undefined && finite(row.flavour) >= 7,
    derivedSize(row) === 'gold',
    finite(row?.valueScore) >= 7
  ].filter(Boolean).length;
  const qualityGold = finite(row?.quality) >= 7;
  if (golds >= 4 || (!qualityGold && hasQualityAwardException(row?.key) && golds >= 3)) return 'gem';
  if (golds >= 3) return 'crown';
  return 'none';
}

function stockMeta(row) {
  const stock = String(row?.stock || 'unknown').toLowerCase();
  if (stock === 'in') return { label:'In stock', className:'stock-in' };
  if (stock === 'out' || stock === 'delisted') return { label:'Out of stock', className:'stock-out' };
  return { label:'Stock unknown', className:'stock-unknown' };
}

function ratingMarkup(label, score, field, { unrated = false } = {}) {
  if (unrated) {
    return `<button type="button" class="catalogue-next-rating unrated" data-catalogue-editable="${escapeHtml(field)}"><span>${escapeHtml(label)}</span><b>Unrated</b><small>—</small></button>`;
  }
  const tier = scoreTier(score);
  return `<button type="button" class="catalogue-next-rating ${tier}" data-catalogue-editable="${escapeHtml(field)}"><span>${escapeHtml(label)}</span><b>${tier[0].toUpperCase() + tier.slice(1)}</b><small>${Math.round(finite(score))}/10</small></button>`;
}

function rankForRow(row, state) {
  const type = catalogueTypeOf(row);
  if (type === 'main') return (recommendationLocation(row.key, state)?.index ?? 0) + 1;
  return Math.max(1, Math.round(finite(row.rank, 1)));
}

function statusButtons(row) {
  const state = record(readPersonalStatuses()[row.key]);
  return ['owned','tried','want','rebuy'].map(name =>
    `<button type="button" class="catalogue-next-status ${state[name] ? 'active' : ''}" data-personal-status="${name}" aria-pressed="${state[name] ? 'true' : 'false'}">${name === 'rebuy' ? 'Rebuy' : name[0].toUpperCase() + name.slice(1)}</button>`
  ).join('');
}

function cardMarkup(row, state) {
  const rank = rankForRow(row, state);
  const stock = stockMeta(row);
  const sizeTier = derivedSize(row);
  const laurel = derivedLaurel(row);
  const image = safeUrl(row.imageUrl);
  const retailers = (Array.isArray(row.retailerLinks) ? row.retailerLinks : [])
    .map(url => safeUrl(url))
    .filter(Boolean)
    .map(url => `<a class="catalogue-next-shop" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(retailerLabel(url))}<span>↗</span></a>`)
    .join('');
  const experience = (Array.isArray(row.experienceTags) ? row.experienceTags : []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('');
  const flavour = row.flavour === null || row.flavour === undefined
    ? ratingMarkup('Flavour', 0, 'flavour', { unrated:true })
    : ratingMarkup('Flavour', row.flavour, 'flavour');
  return `<article class="catalogue-next-card" data-key="${escapeHtml(row.key)}" data-catalogue-type="${escapeHtml(catalogueTypeOf(row))}" data-stock="${escapeHtml(row.stock)}">
    <div class="catalogue-next-rank" data-catalogue-editable="rank"><span>No.</span><b>${rank}</b></div>
    <button type="button" class="catalogue-next-media" data-catalogue-editable="image" aria-label="Edit image">
      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(row.imageAlt || `${row.brand || ''} ${row.title || ''}`.trim())}" style="--catalogue-image-scale:${row.imageScale || 1};object-position:${escapeHtml(row.imageObjectPosition || 'center')}">` : '<span class="catalogue-next-image-placeholder">No image</span>'}
      ${laurel !== 'none' ? `<span class="catalogue-next-laurel ${laurel}">${laurel === 'gem' ? 'Gem' : 'Crown'}</span>` : ''}
    </button>
    <div class="catalogue-next-copy">
      <button type="button" class="catalogue-next-brand" data-catalogue-editable="brand" data-brand="${escapeHtml(row.brand || '')}">${escapeHtml(row.brand || 'Unknown brand')}</button>
      <h3 data-catalogue-editable="title">${escapeHtml(row.title || row.key)}</h3>
      <p class="catalogue-next-eyebrow" data-catalogue-editable="eyebrow"><span class="catalogue-next-stock-dot ${stock.className}" aria-hidden="true"></span>${escapeHtml(row.eyebrow || '')}</p>
      <div class="catalogue-next-summary" data-catalogue-editable="summaryHtml">${sanitiseDisplayMarkup(row.summaryHtml || '')}</div>
      ${row.noteHtml ? `<div class="catalogue-next-note" data-catalogue-editable="noteHtml">${sanitiseDisplayMarkup(row.noteHtml)}</div>` : ''}
      ${experience ? `<div class="catalogue-next-experience" data-catalogue-editable="experienceTags">${experience}</div>` : ''}
      <details class="catalogue-next-details">
        <summary>Blend &amp; practical details</summary>
        <div class="catalogue-next-detail-grid">
          <div data-catalogue-editable="productionHtml"><strong>Production</strong>${sanitiseDisplayMarkup(row.productionHtml || '')}</div>
          <div data-catalogue-editable="practicalHtml"><strong>Practical</strong>${sanitiseDisplayMarkup(row.practicalHtml || '')}</div>
        </div>
      </details>
      <div class="catalogue-next-personal">${statusButtons(row)}</div>
    </div>
    <aside class="catalogue-next-buy">
      <div class="catalogue-next-price" data-catalogue-editable="price"><span>Per cigar</span><strong>${formatAUD(row.price)}</strong></div>
      <div class="catalogue-next-package" data-catalogue-editable="packagePrice">${formatAUD(row.packagePrice ?? row.price)} <span>${escapeHtml(row.packageLabel || 'single cigar')}</span></div>
      <div class="catalogue-next-facts">
        <button type="button" data-catalogue-editable="size"><span>Size</span><b>${escapeHtml(finite(row.length) ? `${finite(row.length).toFixed(2).replace(/\.00$/,'')}″ × ${Math.round(finite(row.ring))}` : 'Unknown')}</b></button>
        <button type="button" data-catalogue-editable="country"><span>Country</span><b>${escapeHtml(row.country || 'Unknown')}</b></button>
        <button type="button" data-catalogue-editable="risk"><span>Risk</span><b>${row.risk === 1 ? 'Low' : row.risk === 2 ? 'Moderate' : 'High'}</b></button>
        <button type="button" data-catalogue-editable="stockPin"><span>Stock</span><b>${escapeHtml(stock.label)}</b></button>
      </div>
      <div class="catalogue-next-ratings">
        ${ratingMarkup('Strength', row.strength, 'strength')}
        ${flavour}
        ${ratingMarkup('Quality', row.quality, 'quality')}
        <button type="button" class="catalogue-next-rating ${sizeTier}" data-catalogue-editable="size"><span>Size</span><b>${sizeTier[0].toUpperCase() + sizeTier.slice(1)}</b><small>${escapeHtml(`${finite(row.length).toFixed(2).replace(/\.00$/,'')} × ${Math.round(finite(row.ring))}`)}</small></button>
        ${ratingMarkup('Value', row.valueScore, 'value')}
      </div>
      <div class="catalogue-next-value-note" data-catalogue-editable="value">Q${row.quality} benchmark ${formatAUD(row.valueBenchmark)} · ${Number.isFinite(row.valueRatio) ? row.valueRatio.toFixed(2) : '—'}×</div>
      ${row.smokeTime ? `<div class="catalogue-next-smoke" data-catalogue-editable="smokeTime">${escapeHtml(row.smokeTime)}</div>` : ''}
      <div class="catalogue-next-retailers" data-catalogue-editable="retailerLinks">${retailers || '<span>No retailer link</span>'}</div>
    </aside>
  </article>`;
}

function sectionMarkup(id, title, description, keys, rowMap, state, extraClass = '') {
  if (!keys.length) return '';
  const cards = keys.map(key => rowMap.has(key) ? cardMarkup(rowMap.get(key), state) : '').join('');
  return `<section class="catalogue-next-section ${extraClass}" id="catalogue-next-${escapeHtml(id)}" data-section-id="${escapeHtml(id)}">
    <header class="catalogue-next-section-head"><div><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div></header>
    <div class="catalogue-next-list">${cards}</div>
  </section>`;
}

function subsectionMarkup(section, rowMap, state) {
  if (!section.keys.length) return '';
  const cards = section.keys.map(key => rowMap.has(key) ? cardMarkup(rowMap.get(key), state) : '').join('');
  return `<section class="catalogue-next-subsection" data-recommendation-subsection="${escapeHtml(section.id)}" id="catalogue-next-subsection-${escapeHtml(section.id)}">
    <header class="catalogue-next-section-head" data-edit-subsection="${escapeHtml(section.id)}">
      <div><h2>${escapeHtml(section.name)}</h2>${section.description ? `<p>${escapeHtml(section.description)}</p>` : ''}</div>
      <div class="catalogue-next-subsection-actions" aria-hidden="true"><button type="button" data-subsection-move="up" data-subsection-id="${escapeHtml(section.id)}">↑</button><button type="button" data-subsection-move="down" data-subsection-id="${escapeHtml(section.id)}">↓</button></div>
    </header>
    <div class="catalogue-next-list">${cards}</div>
  </section>`;
}

function filterRows(rows, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(row => [row.brand,row.title,row.eyebrow,row.country,row.summaryHtml,(row.experienceTags || []).join(' ')]
    .join(' ').replace(/<[^>]+>/g,' ').toLowerCase().includes(needle));
}

function titleForSection(state, key, fallback) {
  return String(state?.sections?.[key] || fallback);
}

export function findCatalogueMountAnchor(root = document) {
  const legacyCardsRoot = root?.getElementById?.('cards');
  if (legacyCardsRoot?.parentElement) return { parent: legacyCardsRoot.parentElement, before: legacyCardsRoot };
  const firstCard = root?.querySelector?.('article.card[data-key]');
  if (!firstCard) return null;
  const main = firstCard.closest?.('main') || root?.querySelector?.('main') || root?.body;
  if (!main) return null;
  let node = firstCard;
  while (node.parentElement && node.parentElement !== main) node = node.parentElement;
  return { parent: main, before: node };
}

function hideLegacyCatalogue(root, seeds) {
  for (const key of Object.keys(seeds)) {
    const card = root.querySelector?.(`article.card[data-key="${globalThis.CSS?.escape ? CSS.escape(key) : key}"]`);
    if (!card) continue;
    card.hidden = true;
    const knownSection = card.closest?.('[data-tier-section],[data-noteworthy-section],[data-half-cigar-section],[data-taster-section],[data-archived-section]');
    if (knownSection) knownSection.dataset.catalogueNextLegacyHidden = '1';
  }
  for (const selector of ['#cards','#flat-main','#taster-cards','#half-cigar-cards','#archived-cards','[data-recommendation-subsections-root]']) {
    root.querySelectorAll?.(selector)?.forEach?.(node => { node.dataset.catalogueNextLegacyHidden = '1'; });
  }
  for (const selector of ['#catalogue-admin','#catalogue-admin-toggle']) {
    const node = root.querySelector?.(selector);
    if (node) node.dataset.catalogueNextLegacyHidden = '1';
  }
}

function captureLegacySupplement(root) {
  return {
    legendHtml: root.querySelector?.('.legend-dropdown .legend')?.innerHTML || '',
    benchmarksHtml: root.querySelector?.('#test-impact-map .test-impact-panel')?.innerHTML || ''
  };
}

function installStyle(root = document) {
  if (!root?.head || root.getElementById(STYLE_ID)) return;
  const style = root.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
:root{--cn-bg:#0b0b0a;--cn-panel:#141310;--cn-panel-2:#1b1915;--cn-line:#343027;--cn-line-soft:#26231d;--cn-text:#f0ece3;--cn-muted:#aaa294;--cn-gold:#c8a65a;--cn-green:#56a06a;--cn-red:#b85b55;--cn-yellow:#c8a04b}
[data-catalogue-next-legacy-hidden="1"]{display:none!important}
#${ROOT_ID}{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--cn-bg);color:var(--cn-text);min-height:100vh;padding-bottom:80px}
#${ROOT_ID} *{box-sizing:border-box}
.catalogue-next-topbar{position:sticky;top:0;z-index:80;background:rgba(11,11,10,.96);backdrop-filter:blur(16px);border-top:1px solid var(--cn-line-soft);border-bottom:1px solid var(--cn-line);box-shadow:0 8px 28px rgba(0,0,0,.32)}
.catalogue-next-topbar-inner{max-width:1480px;margin:0 auto;padding:12px 24px;display:grid;grid-template-columns:minmax(210px,.9fr) minmax(280px,1.35fr) auto;gap:18px;align-items:center}
.catalogue-next-title{appearance:none;border:0;background:transparent;color:var(--cn-text);font-family:Georgia,"Times New Roman",serif;text-align:left;font-size:23px;letter-spacing:.02em;padding:0;cursor:default}.catalogue-next-kicker{display:block;color:var(--cn-gold);font-size:9px;font-family:Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.2em;margin-bottom:2px}
.catalogue-next-search{position:relative}.catalogue-next-search input{width:100%;background:#11100e;border:1px solid var(--cn-line);border-radius:3px;color:var(--cn-text);padding:11px 13px;font-size:14px;outline:none}.catalogue-next-search input:focus{border-color:#87703f;box-shadow:0 0 0 2px rgba(200,166,90,.12)}
.catalogue-next-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end}.catalogue-next-actions button,.catalogue-next-nav a{border:1px solid var(--cn-line);background:#171511;color:#ddd5c7;padding:9px 11px;border-radius:3px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;text-decoration:none;cursor:pointer}.catalogue-next-actions button:hover,.catalogue-next-nav a:hover{border-color:#77653d;color:white}.catalogue-next-actions .primary{border-color:#9b7e40;background:#2b2417;color:#f3dfaa}
.catalogue-next-nav{max-width:1480px;margin:0 auto;padding:0 24px 10px;display:flex;gap:6px;overflow:auto;scrollbar-width:none}.catalogue-next-nav::-webkit-scrollbar{display:none}.catalogue-next-nav a{white-space:nowrap;padding:7px 10px;background:transparent;border-color:transparent;color:var(--cn-muted)}
.catalogue-next-main{max-width:1480px;margin:0 auto;padding:22px 24px 56px}
.catalogue-next-section,.catalogue-next-subsection{margin:0 0 38px}.catalogue-next-section-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;border-bottom:1px solid var(--cn-line);padding:0 2px 10px;margin-bottom:13px}.catalogue-next-section-head h2{font-family:Georgia,"Times New Roman",serif;font-size:24px;font-weight:500;margin:0;letter-spacing:.01em}.catalogue-next-section-head p{margin:5px 0 0;color:var(--cn-muted);font-size:12px;max-width:760px}.catalogue-next-subsection-actions{display:none;gap:5px}.catalogue-next-editing .catalogue-next-subsection-actions{display:flex}.catalogue-next-subsection-actions button{background:#171511;color:#ddd;border:1px solid var(--cn-line);border-radius:3px;padding:4px 9px;cursor:pointer}
.catalogue-next-list{display:flex;flex-direction:column;gap:10px}
.catalogue-next-card{position:relative;display:grid;grid-template-columns:220px minmax(0,1fr) 280px;gap:22px;background:linear-gradient(180deg,#171612,#12110f);border:1px solid var(--cn-line-soft);min-height:270px;padding:18px 18px 18px 14px;box-shadow:0 2px 0 rgba(255,255,255,.015),0 12px 30px rgba(0,0,0,.16)}.catalogue-next-card:hover{border-color:#4c4537}.catalogue-next-rank{position:absolute;left:10px;top:10px;z-index:2;width:44px;height:44px;border:1px solid #5b4a2d;background:#16120c;color:#e8ce91;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}.catalogue-next-rank span{font-size:8px;text-transform:uppercase;letter-spacing:.12em}.catalogue-next-rank b{font-family:Georgia,serif;font-size:18px;margin-top:2px}
.catalogue-next-media{position:relative;appearance:none;border:0;background:radial-gradient(circle at 50% 45%,#222019 0,#0d0c0a 70%);min-height:230px;padding:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:default}.catalogue-next-media img{max-width:90%;max-height:220px;width:auto;height:auto;object-fit:contain;transform:scale(var(--catalogue-image-scale,1));transform-origin:center;filter:drop-shadow(0 11px 10px rgba(0,0,0,.46))}.catalogue-next-image-placeholder{color:#6f695e;font-size:12px}.catalogue-next-laurel{position:absolute;right:8px;top:8px;border:1px solid #7c6636;background:#17120a;color:#d5b56b;padding:4px 7px;font-size:8px;text-transform:uppercase;letter-spacing:.12em}.catalogue-next-laurel.gem{border-color:#8f7b55;color:#f0d69a}.catalogue-next-laurel.crown{color:#cdae64}
.catalogue-next-copy{min-width:0;padding:4px 0}.catalogue-next-brand{appearance:none;border:0;background:transparent;padding:0;color:var(--cn-gold);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;cursor:pointer}.catalogue-next-copy h3{font-family:Georgia,"Times New Roman",serif;font-size:26px;font-weight:500;line-height:1.12;margin:5px 0 4px;color:#f3eee3}.catalogue-next-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#b8ae9d;margin:0 0 15px}.catalogue-next-stock-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;border:1px solid rgba(255,255,255,.25)}.stock-in{background:var(--cn-green)}.stock-out{background:var(--cn-red)}.stock-unknown{background:var(--cn-yellow)}.catalogue-next-summary{font-family:Georgia,"Times New Roman",serif;color:#d8d1c5;font-size:15px;line-height:1.52;max-width:850px}.catalogue-next-note{margin-top:10px;padding-left:10px;border-left:2px solid #5d4c2d;color:#bfb5a5;font-size:12px;line-height:1.45}.catalogue-next-experience{display:flex;gap:5px;flex-wrap:wrap;margin-top:12px}.catalogue-next-experience span{border:1px solid #343026;background:#0f0e0c;color:#aaa293;padding:4px 6px;font-size:9px;text-transform:uppercase;letter-spacing:.04em}.catalogue-next-details{margin-top:13px;border-top:1px solid #29261f;padding-top:8px}.catalogue-next-details summary{cursor:pointer;color:#a99c87;font-size:10px;text-transform:uppercase;letter-spacing:.09em}.catalogue-next-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px;color:#a8a091;font-size:11px;line-height:1.45}.catalogue-next-detail-grid strong{display:block;color:#d1c5b2;text-transform:uppercase;font-size:9px;letter-spacing:.1em;margin-bottom:4px}.catalogue-next-personal{display:flex;gap:5px;flex-wrap:wrap;margin-top:12px}.catalogue-next-status{border:1px solid #333027;background:#0f0e0c;color:#837d73;border-radius:2px;padding:5px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}.catalogue-next-status.active{border-color:#6f5d37;color:#e4c980;background:#211b11}
.catalogue-next-buy{border-left:1px solid #302c24;padding-left:18px;display:flex;flex-direction:column;gap:10px}.catalogue-next-price{display:flex;justify-content:space-between;align-items:baseline}.catalogue-next-price span{color:#938b7f;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.catalogue-next-price strong{font-family:Georgia,serif;font-size:25px;font-weight:500;color:#f3ead9}.catalogue-next-package{color:#d4c7b2;font-size:12px;border-bottom:1px solid #2a2720;padding-bottom:9px}.catalogue-next-package span{display:block;color:#827b70;font-size:9px;text-transform:uppercase;margin-top:2px}.catalogue-next-facts{display:grid;grid-template-columns:1fr 1fr;gap:5px}.catalogue-next-facts button{appearance:none;text-align:left;background:#0f0e0c;border:1px solid #2b2821;padding:7px;color:#c9c0b1}.catalogue-next-facts span{display:block;color:#7f786e;font-size:8px;text-transform:uppercase;letter-spacing:.09em}.catalogue-next-facts b{font-size:10px;font-weight:600}.catalogue-next-ratings{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}.catalogue-next-rating{appearance:none;border:1px solid #2c2922;background:#0d0c0a;padding:6px 3px;color:#b9b1a4;text-align:center;min-width:0}.catalogue-next-rating span{display:block;font-size:7px;text-transform:uppercase;letter-spacing:.05em;color:#7c756a}.catalogue-next-rating b{display:block;font-size:8px;margin:3px 0 1px}.catalogue-next-rating small{display:block;font-size:8px}.catalogue-next-rating.gold{border-color:#6b5732;color:#d9bc75}.catalogue-next-rating.silver{border-color:#4d4d4a;color:#c6c7c4}.catalogue-next-rating.bronze{border-color:#4b3829;color:#bf8d63}.catalogue-next-rating.unrated{opacity:.62}.catalogue-next-value-note{font-size:9px;color:#7f786e;text-align:center}.catalogue-next-smoke{font-size:10px;color:#aaa18f;text-align:center}.catalogue-next-retailers{display:flex;flex-direction:column;gap:5px;margin-top:auto}.catalogue-next-shop{display:flex;justify-content:space-between;border:1px solid #4f432b;background:#18140d;color:#e3c77f;text-decoration:none;padding:8px 9px;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.catalogue-next-retailers>span{color:#676158;font-size:10px}
.catalogue-next-disclosures{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:38px}.catalogue-next-disclosures details{border:1px solid var(--cn-line);background:#12110f}.catalogue-next-disclosures summary{cursor:pointer;padding:13px 15px;font-family:Georgia,serif;font-size:16px}.catalogue-next-disclosure-body{padding:0 15px 15px;color:#b3aa9d;font-size:12px;line-height:1.45;max-height:520px;overflow:auto}
.catalogue-next-brand-explorer{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.74);display:none;align-items:flex-start;justify-content:center;padding:7vh 20px}.catalogue-next-brand-explorer.open{display:flex}.catalogue-next-brand-panel{width:min(920px,100%);max-height:86vh;overflow:auto;background:#141310;border:1px solid #4a4233;box-shadow:0 30px 100px rgba(0,0,0,.7)}.catalogue-next-brand-head{position:sticky;top:0;background:#141310;border-bottom:1px solid var(--cn-line);padding:15px 18px;display:flex;justify-content:space-between;align-items:center;z-index:2}.catalogue-next-brand-head h2{font-family:Georgia,serif;font-weight:500;margin:0}.catalogue-next-brand-head button{background:transparent;border:1px solid #474238;color:#ddd;padding:6px 9px}.catalogue-next-brand-items{padding:10px}.catalogue-next-brand-item{display:grid;grid-template-columns:80px 1fr auto;gap:12px;align-items:center;border-bottom:1px solid #29261f;padding:10px}.catalogue-next-brand-item img{width:70px;height:70px;object-fit:contain;background:#0d0c0a}.catalogue-next-brand-item h3{font-family:Georgia,serif;font-weight:500;margin:0 0 4px}.catalogue-next-brand-item p{margin:0;color:#999184;font-size:11px}.catalogue-next-brand-item button{border:1px solid #5c4d31;background:#18140d;color:#dfc37b;padding:7px 9px}
.catalogue-next-inspector{position:fixed;right:0;top:0;bottom:0;width:min(430px,94vw);z-index:130;background:#11100e;border-left:1px solid #4a4233;box-shadow:-24px 0 60px rgba(0,0,0,.48);transform:translateX(102%);transition:transform .18s ease;display:flex;flex-direction:column}.catalogue-next-inspector.open{transform:translateX(0)}.catalogue-next-inspector-head{padding:16px;border-bottom:1px solid #322e25;display:flex;justify-content:space-between;gap:12px}.catalogue-next-inspector-head h2{font-family:Georgia,serif;font-weight:500;margin:0;font-size:20px}.catalogue-next-inspector-head p{margin:4px 0 0;color:#847d72;font-size:10px}.catalogue-next-inspector-head button{border:1px solid #39352d;background:transparent;color:#ccc;padding:6px 9px}.catalogue-next-inspector-body{padding:15px 16px 110px;overflow:auto}.catalogue-next-field{display:block;margin-bottom:12px}.catalogue-next-field>span{display:block;color:#9d9486;font-size:9px;text-transform:uppercase;letter-spacing:.09em;margin-bottom:5px}.catalogue-next-field input,.catalogue-next-field textarea,.catalogue-next-field select{width:100%;background:#090907;border:1px solid #353027;color:#eee6d9;padding:9px;border-radius:2px;font:12px/1.4 Inter,system-ui,sans-serif}.catalogue-next-field textarea{min-height:92px;resize:vertical}.catalogue-next-field input[type=checkbox]{width:auto}.catalogue-next-field input:focus,.catalogue-next-field textarea:focus,.catalogue-next-field select:focus{outline:none;border-color:#77623a}.catalogue-next-derived-note{padding:9px;border:1px solid #3a3222;background:#17130c;color:#bda875;font-size:10px;margin-bottom:12px}
.catalogue-next-edit-bar{display:none;position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:140;background:#191713;border:1px solid #554932;box-shadow:0 18px 45px rgba(0,0,0,.55);padding:8px;gap:7px;align-items:center;border-radius:4px}.catalogue-next-editing .catalogue-next-edit-bar{display:flex}.catalogue-next-edit-bar button{border:1px solid #3f3a30;background:#0f0e0c;color:#cfc7b9;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.catalogue-next-edit-bar .save{border-color:#92773e;color:#efd792;background:#241d11}.catalogue-next-edit-bar .dirty{color:#d5b568;font-size:10px;padding:0 6px}.catalogue-next-save-status{font-size:10px;color:#9e9688;padding:0 5px}.catalogue-next-save-status.error{color:#df8478}
.catalogue-next-editing [data-catalogue-editable],.catalogue-next-editing [data-edit-subsection],.catalogue-next-editing [data-global-edit]{outline:1px dashed transparent;outline-offset:2px;cursor:pointer}.catalogue-next-editing [data-catalogue-editable]:hover,.catalogue-next-editing [data-edit-subsection]:hover,.catalogue-next-editing [data-global-edit]:hover{outline-color:#9b7e40;background-color:rgba(155,126,64,.045)}.catalogue-next-editing .catalogue-next-card{padding-left:18px}.catalogue-next-editing .catalogue-next-card::after{content:"Click any field to edit";position:absolute;right:8px;top:5px;color:#695b3c;font-size:8px;text-transform:uppercase;letter-spacing:.1em}
@media(max-width:1000px){.catalogue-next-card{grid-template-columns:180px minmax(0,1fr) 240px;gap:14px}.catalogue-next-media{min-height:200px}.catalogue-next-media img{max-height:185px}.catalogue-next-topbar-inner{grid-template-columns:1fr 1.4fr auto}}
@media(max-width:760px){.catalogue-next-topbar-inner{grid-template-columns:1fr auto;padding:10px 12px;gap:8px}.catalogue-next-search{grid-column:1/-1;grid-row:2}.catalogue-next-title{font-size:19px}.catalogue-next-nav{padding:0 12px 8px}.catalogue-next-main{padding:15px 10px 50px}.catalogue-next-card{grid-template-columns:110px minmax(0,1fr);gap:12px;padding:12px}.catalogue-next-media{min-height:150px}.catalogue-next-media img{max-height:145px}.catalogue-next-copy h3{font-size:20px}.catalogue-next-summary{font-size:14px}.catalogue-next-buy{grid-column:1/-1;border-left:0;border-top:1px solid #302c24;padding:12px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}.catalogue-next-ratings,.catalogue-next-retailers,.catalogue-next-facts,.catalogue-next-value-note,.catalogue-next-smoke{grid-column:1/-1}.catalogue-next-disclosures{grid-template-columns:1fr}.catalogue-next-detail-grid{grid-template-columns:1fr}.catalogue-next-actions button{padding:8px}.catalogue-next-actions button:not(.primary){display:none}.catalogue-next-rank{width:38px;height:38px;left:6px;top:6px}.catalogue-next-rank b{font-size:16px}.catalogue-next-edit-bar{bottom:8px;width:calc(100vw - 16px);overflow:auto;justify-content:flex-start}.catalogue-next-inspector{width:100vw}.catalogue-next-brand-explorer{padding:3vh 8px}.catalogue-next-brand-item{grid-template-columns:62px 1fr}.catalogue-next-brand-item img{width:56px;height:56px}.catalogue-next-brand-item>button{grid-column:1/-1}}
`;
  root.head.appendChild(style);
}

function mountShell(root, state) {
  let shell = root.getElementById(ROOT_ID);
  if (shell) return shell;
  const anchor = findCatalogueMountAnchor(root);
  if (!anchor) return null;
  shell = root.createElement('div');
  shell.id = ROOT_ID;
  shell.dataset.catalogueNextVersion = UI_VERSION;
  shell.innerHTML = `<div class="catalogue-next-topbar">
    <div class="catalogue-next-topbar-inner">
      <button type="button" class="catalogue-next-title" data-global-edit="catalogueTitle"><span class="catalogue-next-kicker">Curated small-format cigars</span><span data-title-text>${escapeHtml(titleForSection(state,'catalogueTitle','Cigar Catalogue'))}</span></button>
      <label class="catalogue-next-search"><input type="search" placeholder="Search brand, cigar, country or flavour…" aria-label="Search catalogue" data-catalogue-search></label>
      <div class="catalogue-next-actions"><button type="button" data-scroll-top>Top</button><button type="button" class="primary" data-edit-toggle>Edit Catalogue</button></div>
    </div>
    <nav class="catalogue-next-nav" data-catalogue-next-nav></nav>
  </div>
  <main class="catalogue-next-main" data-catalogue-next-main></main>
  <div class="catalogue-next-brand-explorer" id="catalogue-next-brand-explorer" aria-hidden="true"><div class="catalogue-next-brand-panel"><header class="catalogue-next-brand-head"><h2 data-brand-title></h2><button type="button" data-brand-close>Close</button></header><div class="catalogue-next-brand-items" data-brand-items></div></div></div>
  <aside class="catalogue-next-inspector" data-catalogue-inspector aria-hidden="true"><header class="catalogue-next-inspector-head"><div><h2 data-inspector-title>Edit</h2><p data-inspector-context></p></div><button type="button" data-inspector-close>Close</button></header><div class="catalogue-next-inspector-body" data-inspector-body></div></aside>
  <div class="catalogue-next-edit-bar" id="catalogue-next-edit-bar"><span class="dirty" data-dirty-count>0 changes</span><button type="button" data-edit-action="undo">Undo</button><button type="button" data-edit-action="discard">Discard</button><button type="button" class="save" data-edit-action="save">Save Changes</button><button type="button" data-edit-action="done">Done Editing</button><span class="catalogue-next-save-status" data-save-status></span></div>`;
  anchor.parent.insertBefore(shell, anchor.before);
  return shell;
}

function navMarkup(plan, state) {
  const links = [];
  if (plan.recommendations.some(section => section.keys.length)) links.push(`<a href="#catalogue-next-recommendations">${escapeHtml(titleForSection(state,'recommendationTitle','Recommendations'))}</a>`);
  if (plan.half.length) links.push(`<a href="#catalogue-next-half">${escapeHtml(titleForSection(state,'halfTitle','Half-Cigars'))}</a>`);
  if (plan.tasters.length) links.push(`<a href="#catalogue-next-tasters">${escapeHtml(titleForSection(state,'tasterTitle','Tasters'))}</a>`);
  if (plan.unavailable.length) links.push(`<a href="#catalogue-next-unavailable">${escapeHtml(titleForSection(state,'unavailableTitle','Unavailable'))}</a>`);
  return links.join('');
}

function renderDisclosures(ctx) {
  const legendHtml = ctx.draftState.sections?.legendHtml ?? ctx.supplement.legendHtml;
  const benchmarksHtml = ctx.draftState.sections?.benchmarksHtml ?? ctx.supplement.benchmarksHtml;
  if (!legendHtml && !benchmarksHtml) return '';
  return `<div class="catalogue-next-disclosures">
    ${legendHtml ? `<details><summary data-global-edit="legendHtml">Legends</summary><div class="catalogue-next-disclosure-body" data-global-edit="legendHtml">${sanitiseDisplayMarkup(legendHtml)}</div></details>` : ''}
    ${benchmarksHtml ? `<details><summary data-global-edit="benchmarksHtml">Benchmarks</summary><div class="catalogue-next-disclosure-body" data-global-edit="benchmarksHtml">${sanitiseDisplayMarkup(benchmarksHtml)}</div></details>` : ''}
  </div>`;
}

export function renderCatalogueSections(root = document, state = activeContext?.draftState) {
  const ctx = activeContext;
  if (!ctx?.shell || !state) return 0;
  const allRows = rowsFromStateAndSeeds(state, ctx.seeds, ctx.stockResults, ctx.imagePreviews);
  const visibleRows = filterRows(allRows, ctx.query);
  const visibleSet = new Set(visibleRows.map(row => row.key));
  const plan = sectionPlanForRows(allRows, state);
  const filteredPlan = {
    recommendations: plan.recommendations.map(section => ({ ...section, keys: section.keys.filter(key => visibleSet.has(key)) })),
    half: plan.half.filter(key => visibleSet.has(key)),
    tasters: plan.tasters.filter(key => visibleSet.has(key)),
    unavailable: plan.unavailable.filter(key => visibleSet.has(key))
  };
  const rowMap = new Map(allRows.map(row => [row.key, row]));
  const recommendationHtml = filteredPlan.recommendations.some(section => section.keys.length)
    ? `<section class="catalogue-next-section" id="catalogue-next-recommendations"><header class="catalogue-next-section-head"><div><h2 data-global-edit="recommendationTitle">${escapeHtml(titleForSection(state,'recommendationTitle','Recommendations'))}</h2></div></header>${filteredPlan.recommendations.map(section => subsectionMarkup(section,rowMap,state)).join('')}</section>`
    : '';
  const half = sectionMarkup('half', titleForSection(state,'halfTitle','Half-Cigars'), 'Purpose-built half-smoke formats, ranked independently.', filteredPlan.half, rowMap, state, 'catalogue-next-half-section');
  const tasters = sectionMarkup('tasters', titleForSection(state,'tasterTitle','Tasters'), 'Low-commitment ways to test a blend, ranked independently.', filteredPlan.tasters, rowMap, state, 'catalogue-next-taster-section');
  const unavailableHtml = filteredPlan.unavailable.length
    ? `<details class="catalogue-next-section catalogue-next-unavailable" id="catalogue-next-unavailable"><summary class="catalogue-next-section-head"><div><h2 data-global-edit="unavailableTitle">${escapeHtml(titleForSection(state,'unavailableTitle','Unavailable & Archived'))}</h2><p>Out-of-stock, delisted and archived entries are retained here.</p></div></summary><div class="catalogue-next-list">${filteredPlan.unavailable.map(key => rowMap.has(key) ? cardMarkup(rowMap.get(key),state) : '').join('')}</div></details>`
    : '';
  const main = ctx.shell.querySelector('[data-catalogue-next-main]');
  main.innerHTML = `${recommendationHtml}${half}${tasters}${unavailableHtml}${renderDisclosures(ctx)}`;
  ctx.shell.querySelector('[data-catalogue-next-nav]').innerHTML = navMarkup(filteredPlan,state);
  ctx.shell.querySelector('[data-title-text]').textContent = titleForSection(state,'catalogueTitle','Cigar Catalogue');
  ctx.rows = allRows;
  refreshDirtyState(ctx);
  return allRows.length;
}

export function buildCatalogueShell(root = document, state = activeContext?.draftState) {
  const ctx = activeContext;
  if (!ctx) return null;
  installStyle(root);
  ctx.shell = mountShell(root,state);
  if (!ctx.shell) return null;
  hideLegacyCatalogue(root,ctx.seeds);
  renderCatalogueSections(root,state);
  return ctx.shell;
}

function jsonEqual(a,b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function refreshDirtyState(ctx) {
  const dirty = !jsonEqual(buildDraftSavePayload(ctx.baseState,ctx.baseState),buildDraftSavePayload(ctx.baseState,ctx.draftState)) || ctx.pendingImages.size > 0;
  ctx.dirty = dirty;
  const count = dirty ? Math.max(1, ctx.undoStack.length) : 0;
  const node = ctx.shell?.querySelector?.('[data-dirty-count]');
  if (node) node.textContent = `${count} change${count === 1 ? '' : 's'}`;
  const undo = ctx.shell?.querySelector?.('[data-edit-action="undo"]');
  if (undo) undo.disabled = !ctx.undoStack.length;
}

function pushUndo(ctx) {
  ctx.undoStack.push({ state: clone(ctx.draftState), pendingImages: new Map(ctx.pendingImages), imagePreviews: new Map(ctx.imagePreviews) });
  if (ctx.undoStack.length > 60) ctx.undoStack.shift();
}

function setSaveStatus(ctx,message,error=false) {
  const node = ctx.shell?.querySelector?.('[data-save-status]');
  if (!node) return;
  node.textContent = String(message || '');
  node.classList.toggle('error',Boolean(error));
}

function sourceForKey(ctx,key) {
  return rowsFromStateAndSeeds(ctx.draftState,ctx.seeds,ctx.stockResults,ctx.imagePreviews).find(row => row.key === key) || { key };
}

function updateDynamicEntryFromPatch(ctx,key,patch) {
  if (!own(ctx.draftState.entries,key)) return;
  const entry = { ...record(ctx.draftState.entries[key]) };
  const supported = new Set(['brand','title','eyebrow','packagePrice','packageLabel','price','length','ring','country','strength','quality','risk','stockPin','rank','taster','archived','archivedAt','experienceTags','summaryHtml','noteHtml','smokeTime','retailerLinks','imageUrl','imageSourceKey','imageVersion']);
  for (const [name,value] of Object.entries(patch)) if (supported.has(name)) entry[name] = value;
  if (own(patch,'productionHtml')) entry.productionLines = String(patch.productionHtml || '').replace(/<br\s*\/?>/gi,'\n').replace(/<\/[^>]+>/g,'\n').replace(/<[^>]+>/g,'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  if (own(patch,'practicalHtml')) entry.practicalLines = String(patch.practicalHtml || '').replace(/<br\s*\/?>/gi,'\n').replace(/<\/[^>]+>/g,'\n').replace(/<[^>]+>/g,'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  ctx.draftState.entries[key] = entry;
}

function removeFromRecommendationSubsections(state,key) {
  if (!Array.isArray(state.recommendationSubsections)) return state;
  state.recommendationSubsections = state.recommendationSubsections.map(section => ({ ...section, entryKeys:[...(section.entryKeys || [])].filter(entryKey => entryKey !== key) }));
  return state;
}

function ensureMainRecommendationMembership(state,key) {
  if (!Array.isArray(state.recommendationSubsections) || !state.recommendationSubsections.length) return state;
  if (recommendationLocation(key,state)) return state;
  state.recommendationSubsections[0] = { ...state.recommendationSubsections[0], entryKeys:[...(state.recommendationSubsections[0].entryKeys || []),key] };
  return state;
}

function normaliseRankedCohort(ctx,type) {
  const rows = rowsFromStateAndSeeds(ctx.draftState,ctx.seeds,ctx.stockResults,ctx.imagePreviews)
    .filter(row => catalogueTypeOf(row) === type && !row.archived)
    .sort((a,b) => finite(a.rank,9999)-finite(b.rank,9999));
  rows.forEach((row,index) => {
    ctx.draftState = mergeSparseCardPatch(ctx.draftState,row.key,{ rank:index+1 });
    updateDynamicEntryFromPatch(ctx,row.key,{ rank:index+1 });
  });
}

function applyFieldChange(ctx,key,field,value) {
  const source = sourceForKey(ctx,key);
  if (field === 'rank') {
    const type = catalogueTypeOf(source);
    if (type === 'main' && Array.isArray(ctx.draftState.recommendationSubsections)) {
      const location = recommendationLocation(key,ctx.draftState);
      if (!location) return;
      ctx.draftState = moveRecommendationEntry(ctx.draftState,key,location.subsectionId,Math.max(0,Math.round(finite(value,1))-1));
      return;
    }
    const rows = rowsFromStateAndSeeds(ctx.draftState,ctx.seeds,ctx.stockResults,ctx.imagePreviews);
    const reordered = moveRankedCohort(rows,key,Math.max(0,Math.round(finite(value,1))-1),type);
    reordered.filter(row => catalogueTypeOf(row) === type).forEach(row => {
      ctx.draftState = mergeSparseCardPatch(ctx.draftState,row.key,{rank:row.rank});
      updateDynamicEntryFromPatch(ctx,row.key,{rank:row.rank});
    });
    return;
  }
  const patch = editablePatch(field,value,source);
  const oldType = catalogueTypeOf(source);
  ctx.draftState = mergeSparseCardPatch(ctx.draftState,key,patch);
  updateDynamicEntryFromPatch(ctx,key,patch);
  if (field === 'archived') {
    if (Boolean(value)) removeFromRecommendationSubsections(ctx.draftState,key);
    else if (catalogueTypeOf({ ...source,...patch }) === 'main') ensureMainRecommendationMembership(ctx.draftState,key);
  }
  if (field === 'catalogueType') {
    const nextType = catalogueTypeOf({ ...source,...patch });
    if (oldType === 'main' && nextType !== 'main') removeFromRecommendationSubsections(ctx.draftState,key);
    if (nextType === 'main') ensureMainRecommendationMembership(ctx.draftState,key);
    if (oldType === 'half' || oldType === 'taster') normaliseRankedCohort(ctx,oldType);
    if (nextType === 'half' || nextType === 'taster') normaliseRankedCohort(ctx,nextType);
  }
}

function fieldValue(row,field) {
  if (field === 'value') return row.valueScore;
  if (field === 'retailerLinks' || field === 'experienceTags') return Array.isArray(row[field]) ? row[field].join('\n') : '';
  return row[field] ?? '';
}

function fieldControl(field,row,key) {
  const value = fieldValue(row,field.name);
  const common = `data-inspector-field="${escapeHtml(field.name)}" data-inspector-key="${escapeHtml(key)}"`;
  if (field.type === 'file') return `<label class="catalogue-next-field"><span>${escapeHtml(field.label)}</span><input ${common} type="file" accept="image/png,image/jpeg,image/webp"></label>`;
  if (field.type === 'textarea') return `<label class="catalogue-next-field"><span>${escapeHtml(field.label)}</span><textarea ${common}>${escapeHtml(value)}</textarea></label>`;
  if (field.type === 'select') return `<label class="catalogue-next-field"><span>${escapeHtml(field.label)}</span><select ${common}>${(field.options || []).map(([option,label]) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
  if (field.type === 'checkbox') return `<label class="catalogue-next-field"><span>${escapeHtml(field.label)}</span><input ${common} type="checkbox" ${value ? 'checked' : ''}></label>`;
  const attrs = [field.step ? `step="${field.step}"` : '',field.min ? `min="${field.min}"` : '',field.max ? `max="${field.max}"` : '',field.readOnly ? 'readonly' : ''].filter(Boolean).join(' ');
  return `<label class="catalogue-next-field"><span>${escapeHtml(field.label)}</span><input ${common} type="${field.type === 'number' ? 'number' : 'text'}" ${attrs} value="${escapeHtml(value)}"></label>`;
}

function inspectorRankFields(ctx,row) {
  const type = catalogueTypeOf(row);
  if (type !== 'main' || !Array.isArray(ctx.draftState.recommendationSubsections)) return inspectorFieldsForTarget('rank').map(field => fieldControl(field,row,row.key)).join('');
  const location = recommendationLocation(row.key,ctx.draftState);
  const subsectionOptions = ctx.draftState.recommendationSubsections.map(section => `<option value="${escapeHtml(section.id)}" ${location?.subsectionId === section.id ? 'selected' : ''}>${escapeHtml(section.name)}</option>`).join('');
  return `<label class="catalogue-next-field"><span>Recommendation subsection</span><select data-inspector-main-subsection="${escapeHtml(row.key)}">${subsectionOptions}</select></label><label class="catalogue-next-field"><span>Position inside subsection</span><input type="number" min="1" step="1" value="${(location?.index ?? 0)+1}" data-inspector-main-position="${escapeHtml(row.key)}"></label><div class="catalogue-next-derived-note">Recommendation numbering is local to this subsection. Half-Cigars and Tasters are separate ranking cohorts.</div>`;
}

function openInspector(ctx,key,target='card') {
  const inspector = ctx.shell.querySelector('[data-catalogue-inspector]');
  const body = inspector.querySelector('[data-inspector-body]');
  const title = inspector.querySelector('[data-inspector-title]');
  const context = inspector.querySelector('[data-inspector-context]');
  const row = sourceForKey(ctx,key);
  ctx.inspectorTarget = { kind:'card', key, target };
  title.textContent = target === 'card' ? 'Edit cigar' : `Edit ${target}`;
  context.textContent = `${row.brand || ''} ${row.title || row.key}`.trim();
  if (target === 'rank') body.innerHTML = inspectorRankFields(ctx,row);
  else {
    const fields = inspectorFieldsForTarget(target);
    body.innerHTML = `${target === 'value' ? '<div class="catalogue-next-derived-note">Value is automatic. Change price, quality or flavour and the Value rating recalculates immediately.</div>' : ''}${fields.map(field => fieldControl(field,row,key)).join('')}`;
  }
  inspector.classList.add('open');
  inspector.setAttribute('aria-hidden','false');
}

function openSubsectionInspector(ctx,id) {
  const subsection = ctx.draftState.recommendationSubsections?.find(section => section.id === id);
  if (!subsection) return;
  const inspector = ctx.shell.querySelector('[data-catalogue-inspector]');
  ctx.inspectorTarget = { kind:'subsection', id };
  inspector.querySelector('[data-inspector-title]').textContent = 'Edit subsection';
  inspector.querySelector('[data-inspector-context]').textContent = subsection.name;
  inspector.querySelector('[data-inspector-body]').innerHTML = `<label class="catalogue-next-field"><span>Name</span><input type="text" data-subsection-field="name" data-subsection-id="${escapeHtml(id)}" value="${escapeHtml(subsection.name)}"></label><label class="catalogue-next-field"><span>Description</span><textarea data-subsection-field="description" data-subsection-id="${escapeHtml(id)}">${escapeHtml(subsection.description || '')}</textarea></label>`;
  inspector.classList.add('open');
  inspector.setAttribute('aria-hidden','false');
}

function openGlobalInspector(ctx,field) {
  const inspector = ctx.shell.querySelector('[data-catalogue-inspector]');
  ctx.inspectorTarget = { kind:'global', field };
  const labels = { catalogueTitle:'Catalogue title',recommendationTitle:'Recommendation section title',halfTitle:'Half-Cigar section title',tasterTitle:'Taster section title',unavailableTitle:'Unavailable section title',legendHtml:'Legends content',benchmarksHtml:'Benchmarks content' };
  inspector.querySelector('[data-inspector-title]').textContent = `Edit ${labels[field] || field}`;
  inspector.querySelector('[data-inspector-context]').textContent = 'Catalogue UI';
  const current = ctx.draftState.sections?.[field] ?? (field === 'legendHtml' ? ctx.supplement.legendHtml : field === 'benchmarksHtml' ? ctx.supplement.benchmarksHtml : '');
  inspector.querySelector('[data-inspector-body]').innerHTML = field.endsWith('Html')
    ? `<label class="catalogue-next-field"><span>${escapeHtml(labels[field] || field)}</span><textarea data-global-field="${escapeHtml(field)}">${escapeHtml(current)}</textarea></label>`
    : `<label class="catalogue-next-field"><span>${escapeHtml(labels[field] || field)}</span><input type="text" data-global-field="${escapeHtml(field)}" value="${escapeHtml(current || titleForSection(ctx.draftState,field,labels[field] || field))}"></label>`;
  inspector.classList.add('open');
  inspector.setAttribute('aria-hidden','false');
}

function closeInspector(ctx) {
  const inspector = ctx.shell.querySelector('[data-catalogue-inspector]');
  inspector.classList.remove('open');
  inspector.setAttribute('aria-hidden','true');
  ctx.inspectorTarget = null;
}

export function openBrandExplorer(brandInput, ctx = activeContext) {
  if (!ctx?.shell) return false;
  const brand = String(brandInput || '').trim();
  const rows = rowsFromStateAndSeeds(ctx.draftState,ctx.seeds,ctx.stockResults,ctx.imagePreviews);
  const matches = brandGroups(rows).get(brand) || [];
  if (!matches.length) return false;
  const overlay = ctx.shell.querySelector('#catalogue-next-brand-explorer');
  overlay.querySelector('[data-brand-title]').textContent = `${brand} · ${matches.length} product${matches.length === 1 ? '' : 's'}`;
  overlay.querySelector('[data-brand-items]').innerHTML = matches.map(row => `<div class="catalogue-next-brand-item"><div>${row.imageUrl ? `<img src="${escapeHtml(safeUrl(row.imageUrl))}" alt="">` : ''}</div><div><h3>${escapeHtml(row.title || row.key)}</h3><p>${formatAUD(row.price)} · ${finite(row.length).toFixed(2).replace(/\.00$/,'')}″ × ${Math.round(finite(row.ring))} · Q${row.quality}/10</p></div><button type="button" data-brand-jump="${escapeHtml(row.key)}">View</button></div>`).join('');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden','false');
  return true;
}

function closeBrandExplorer(ctx) {
  const overlay = ctx.shell.querySelector('#catalogue-next-brand-explorer');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden','true');
}

function cardElementForKey(ctx,key) {
  const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key;
  return ctx.shell.querySelector(`.catalogue-next-card[data-key="${escaped}"]`);
}

function moveSubsection(ctx,id,direction) {
  const list = [...(ctx.draftState.recommendationSubsections || [])];
  const index = list.findIndex(section => section.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return;
  pushUndo(ctx);
  [list[index],list[target]] = [list[target],list[index]];
  ctx.draftState.recommendationSubsections = list;
  renderCatalogueSections(document,ctx.draftState);
}

function readInspectorValue(control,field) {
  if (control.type === 'checkbox') return control.checked;
  if (control.type === 'number') {
    if (field === 'flavour' && control.value === '') return null;
    return finite(control.value,0);
  }
  return control.value;
}

function handleInspectorChange(ctx,event) {
  const control = event.target;
  if (control.matches?.('[data-inspector-field]')) {
    const field = control.dataset.inspectorField;
    const key = control.dataset.inspectorKey;
    if (field === 'imageFile') {
      const file = control.files?.[0];
      if (!file) return;
      if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { setSaveStatus(ctx,'PNG, JPEG or WebP only.',true); return; }
      pushUndo(ctx);
      ctx.pendingImages.set(key,file);
      const previous = ctx.imagePreviews.get(key);
      if (previous?.startsWith?.('blob:')) URL.revokeObjectURL(previous);
      ctx.imagePreviews.set(key,URL.createObjectURL(file));
      renderCatalogueSections(document,ctx.draftState);
      openInspector(ctx,key,'image');
      return;
    }
    pushUndo(ctx);
    if (field === 'imageScale' || field === 'imageObjectPosition') {
      ctx.draftState = mergeSparseCardPatch(ctx.draftState,key,{ [field]: field === 'imageScale' ? finite(control.value,1) : control.value });
    } else {
      applyFieldChange(ctx,key,field,readInspectorValue(control,field));
    }
    renderCatalogueSections(document,ctx.draftState);
    openInspector(ctx,key,ctx.inspectorTarget?.target || field);
    return;
  }
  if (control.matches?.('[data-inspector-main-subsection]')) {
    const key = control.dataset.inspectorMainSubsection;
    pushUndo(ctx);
    ctx.draftState = moveRecommendationEntry(ctx.draftState,key,control.value,0);
    renderCatalogueSections(document,ctx.draftState);
    openInspector(ctx,key,'rank');
    return;
  }
  if (control.matches?.('[data-inspector-main-position]')) {
    const key = control.dataset.inspectorMainPosition;
    const location = recommendationLocation(key,ctx.draftState);
    if (!location) return;
    pushUndo(ctx);
    ctx.draftState = moveRecommendationEntry(ctx.draftState,key,location.subsectionId,Math.max(0,Math.round(finite(control.value,1))-1));
    renderCatalogueSections(document,ctx.draftState);
    openInspector(ctx,key,'rank');
    return;
  }
  if (control.matches?.('[data-subsection-field]')) {
    const id = control.dataset.subsectionId;
    const field = control.dataset.subsectionField;
    pushUndo(ctx);
    ctx.draftState.recommendationSubsections = (ctx.draftState.recommendationSubsections || []).map(section => section.id === id ? { ...section,[field]:control.value } : section);
    renderCatalogueSections(document,ctx.draftState);
    openSubsectionInspector(ctx,id);
    return;
  }
  if (control.matches?.('[data-global-field]')) {
    const field = control.dataset.globalField;
    pushUndo(ctx);
    ctx.draftState.sections = { ...record(ctx.draftState.sections), [field]:control.value };
    renderCatalogueSections(document,ctx.draftState);
    openGlobalInspector(ctx,field);
  }
}

async function uploadPendingImages(ctx,state) {
  let next = state;
  for (const [key,file] of ctx.pendingImages) {
    const response = await adminWriteFetch(`${IMAGE_API}${encodeURIComponent(key)}`,{ method:'PUT',headers:{'content-type':file.type},body:file });
    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch (_) {}
      throw new Error(payload.error || `Image upload failed (${response.status})`);
    }
    const current = sourceForKey(ctx,key);
    const version = Math.max(0,Math.round(finite(current.imageVersion,0))) + 1;
    const patch = { imageUrl:`${IMAGE_API}${encodeURIComponent(key)}?v=${version}`,imageSourceKey:key,imageVersion:version };
    next = mergeSparseCardPatch(next,key,patch);
    if (own(next.entries,key)) next.entries[key] = { ...record(next.entries[key]),...patch };
  }
  return next;
}

async function saveDraft(ctx) {
  if (!ctx.dirty) { setSaveStatus(ctx,'No changes to save.'); return true; }
  setSaveStatus(ctx,'Saving…');
  try {
    let outgoing = clone(ctx.draftState);
    outgoing = await uploadPendingImages(ctx,outgoing);
    const payload = buildDraftSavePayload(ctx.baseState,outgoing);
    const response = await adminWriteFetch(STATE_API,{ method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload) });
    if (!response.ok) {
      let errorPayload = {};
      try { errorPayload = await response.json(); } catch (_) {}
      throw new Error(errorPayload.error || `Catalogue save failed (${response.status})`);
    }
    const freshResponse = await fetch(`${STATE_API}?next_ui_readback=1`,{cache:'no-store',headers:{accept:'application/json'}});
    if (!freshResponse.ok) throw new Error(`Catalogue saved but read-back failed (${freshResponse.status}).`);
    const fresh = await freshResponse.json();
    ctx.baseState = clone(fresh);
    ctx.draftState = clone(fresh);
    ctx.pendingImages.clear();
    for (const url of ctx.imagePreviews.values()) if (String(url).startsWith('blob:')) URL.revokeObjectURL(url);
    ctx.imagePreviews.clear();
    ctx.undoStack = [];
    renderCatalogueSections(document,ctx.draftState);
    setSaveStatus(ctx,'Saved and verified.');
    return true;
  } catch (error) {
    setSaveStatus(ctx,error.message || String(error),true);
    return false;
  }
}

function undo(ctx) {
  const snapshot = ctx.undoStack.pop();
  if (!snapshot) return;
  for (const url of ctx.imagePreviews.values()) if (String(url).startsWith('blob:') && ![...snapshot.imagePreviews.values()].includes(url)) URL.revokeObjectURL(url);
  ctx.draftState = snapshot.state;
  ctx.pendingImages = snapshot.pendingImages;
  ctx.imagePreviews = snapshot.imagePreviews;
  renderCatalogueSections(document,ctx.draftState);
  closeInspector(ctx);
}

function discard(ctx) {
  for (const url of ctx.imagePreviews.values()) if (String(url).startsWith('blob:')) URL.revokeObjectURL(url);
  ctx.draftState = clone(ctx.baseState);
  ctx.pendingImages.clear();
  ctx.imagePreviews.clear();
  ctx.undoStack = [];
  renderCatalogueSections(document,ctx.draftState);
  closeInspector(ctx);
  setSaveStatus(ctx,'Changes discarded.');
}

function setEditMode(ctx,enabled) {
  ctx.editing = Boolean(enabled);
  ctx.shell.classList.toggle('catalogue-next-editing',ctx.editing);
  const button = ctx.shell.querySelector('[data-edit-toggle]');
  if (button) button.textContent = ctx.editing ? 'Editing Catalogue' : 'Edit Catalogue';
  if (!ctx.editing) closeInspector(ctx);
}

function installEvents(ctx) {
  ctx.shell.addEventListener('input',event => {
    if (event.target.matches?.('[data-catalogue-search]')) {
      ctx.query = event.target.value;
      renderCatalogueSections(document,ctx.draftState);
      const search = ctx.shell.querySelector('[data-catalogue-search]');
      if (search) { search.value = ctx.query; search.focus(); }
    }
  });
  ctx.shell.addEventListener('change',event => handleInspectorChange(ctx,event));
  ctx.shell.addEventListener('click',async event => {
    const editToggle = event.target.closest?.('[data-edit-toggle]');
    if (editToggle) { setEditMode(ctx,!ctx.editing); return; }
    if (event.target.closest?.('[data-scroll-top]')) { globalThis.scrollTo?.({top:0,behavior:'smooth'}); return; }
    if (event.target.closest?.('[data-inspector-close]')) { closeInspector(ctx); return; }
    if (event.target.closest?.('[data-brand-close]')) { closeBrandExplorer(ctx); return; }
    const brandJump = event.target.closest?.('[data-brand-jump]');
    if (brandJump) {
      closeBrandExplorer(ctx);
      const card = cardElementForKey(ctx,brandJump.dataset.brandJump);
      card?.scrollIntoView?.({behavior:'smooth',block:'center'});
      return;
    }
    const action = event.target.closest?.('[data-edit-action]')?.dataset?.editAction;
    if (action) {
      if (action === 'undo') undo(ctx);
      if (action === 'discard') discard(ctx);
      if (action === 'save') await saveDraft(ctx);
      if (action === 'done') {
        if (ctx.dirty) setSaveStatus(ctx,'Save or discard changes before leaving edit mode.',true);
        else setEditMode(ctx,false);
      }
      return;
    }
    const move = event.target.closest?.('[data-subsection-move]');
    if (move && ctx.editing) { moveSubsection(ctx,move.dataset.subsectionId,move.dataset.subsectionMove); return; }
    const status = event.target.closest?.('[data-personal-status]');
    if (status) {
      const card = status.closest('.catalogue-next-card');
      if (!card) return;
      const next = status.getAttribute('aria-pressed') !== 'true';
      status.setAttribute('aria-pressed',next ? 'true' : 'false');
      status.classList.toggle('active',next);
      writePersonalStatus(card.dataset.key,status.dataset.personalStatus,next);
      return;
    }
    const subsection = event.target.closest?.('[data-edit-subsection]');
    if (subsection && ctx.editing) { openSubsectionInspector(ctx,subsection.dataset.editSubsection); return; }
    const globalEdit = event.target.closest?.('[data-global-edit]');
    if (globalEdit && ctx.editing) { event.preventDefault(); openGlobalInspector(ctx,globalEdit.dataset.globalEdit); return; }
    const editable = event.target.closest?.('[data-catalogue-editable]');
    if (editable && ctx.editing) {
      event.preventDefault();
      const card = editable.closest('.catalogue-next-card');
      if (card) openInspector(ctx,card.dataset.key,resolveEditableField(editable) || 'card');
      return;
    }
    const brand = event.target.closest?.('.catalogue-next-brand[data-brand]');
    if (brand && !ctx.editing) { openBrandExplorer(brand.dataset.brand,ctx); return; }
    const card = event.target.closest?.('.catalogue-next-card');
    if (card && ctx.editing && !event.target.closest('a,button,details,summary')) openInspector(ctx,card.dataset.key,'card');
  });
}

async function fetchCatalogueState() {
  const response = await fetch(`${STATE_API}?next_ui=1`,{cache:'no-store',headers:{accept:'application/json'}});
  if (!response.ok) throw new Error(`Catalogue state load failed (${response.status}).`);
  return response.json();
}

async function fetchStockResults() {
  try {
    const response = await fetch(`${STOCK_API}?next_ui=1`,{cache:'no-store',headers:{accept:'application/json'}});
    if (!response.ok) return {};
    const payload = await response.json();
    return record(payload?.results);
  } catch (_) { return {}; }
}

function restoreInitialTop() {
  if (!shouldResetInitialScroll(globalThis.location)) return;
  try { if (globalThis.history && 'scrollRestoration' in globalThis.history) globalThis.history.scrollRestoration = 'manual'; } catch (_) {}
  globalThis.scrollTo?.(0,0);
  globalThis.requestAnimationFrame?.(() => globalThis.requestAnimationFrame?.(() => globalThis.scrollTo?.(0,0)));
}

async function bootCatalogueNextUI(root,options={}) {
  if (root.getElementById(ROOT_ID)) return activeContext;
  const seeds = captureLegacySeeds(root);
  if (!Object.keys(seeds).length) return null;
  const supplement = captureLegacySupplement(root);
  let state;
  try { state = await (options.stateLoader ? options.stateLoader() : fetchCatalogueState()); }
  catch (error) {
    console.error('[catalogue-next] live state unavailable; rendering static catalogue seed',error);
    state = { version:3,cards:{},entries:{},sections:{} };
  }
  const ctx = {
    root,seeds,supplement,
    baseState:clone(state),
    draftState:clone(state),
    stockResults:{},
    imagePreviews:new Map(),
    pendingImages:new Map(),
    undoStack:[],
    query:'',
    editing:false,
    dirty:false,
    shell:null,
    rows:[]
  };
  activeContext = ctx;
  installStyle(root);
  buildCatalogueShell(root,ctx.draftState);
  if (!ctx.shell) return null;
  installEvents(ctx);
  restoreInitialTop();
  ctx.stockResults = await (options.stockLoader ? options.stockLoader() : fetchStockResults());
  renderCatalogueSections(root,ctx.draftState);
  restoreInitialTop();
  return ctx;
}

export function installCatalogueNextUI(root = document,options={}) {
  if (!root) return Promise.resolve(null);
  if (root.readyState === 'loading') {
    return new Promise(resolve => root.addEventListener('DOMContentLoaded',() => bootCatalogueNextUI(root,options).then(resolve),{once:true}));
  }
  return bootCatalogueNextUI(root,options);
}

if (typeof document !== 'undefined') installCatalogueNextUI(document);

export { UI_VERSION };
