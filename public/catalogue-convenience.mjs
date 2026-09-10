const STORAGE_KEY = 'cigar-catalogue-convenience-v1';
const PERSONAL_STATUSES = Object.freeze(['owned', 'tried', 'want', 'rebuy']);
const PERSONAL_FILTERS = new Set(['all', ...PERSONAL_STATUSES]);
const VIEW_MODES = new Set(['compact', 'detailed']);
const MAX_COMPARE = 4;

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function cleanKey(value) {
  return String(value || '').trim();
}

function uniqueKeys(value, limit = Number.MAX_SAFE_INTEGER) {
  const output = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const key = cleanKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(key);
    if (output.length >= limit) break;
  }
  return output;
}

function normaliseStatusMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [rawKey, rawStatus] of Object.entries(value)) {
    const key = cleanKey(rawKey);
    if (!key || !rawStatus || typeof rawStatus !== 'object' || Array.isArray(rawStatus)) continue;
    output[key] = {
      owned: Boolean(rawStatus.owned),
      tried: Boolean(rawStatus.tried),
      want: Boolean(rawStatus.want),
      rebuy: Boolean(rawStatus.rebuy)
    };
  }
  return output;
}

export function normaliseConvenienceState(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    version: 1,
    viewMode: VIEW_MODES.has(raw.viewMode) ? raw.viewMode : 'compact',
    personalFilter: PERSONAL_FILTERS.has(raw.personalFilter) ? raw.personalFilter : 'all',
    statuses: normaliseStatusMap(raw.statuses),
    compare: uniqueKeys(raw.compare, MAX_COMPARE),
    expandedKeys: uniqueKeys(raw.expandedKeys),
    collapsedKeys: uniqueKeys(raw.collapsedKeys)
  };
}

export function togglePersonalStatus(input, rawKey, status) {
  const state = normaliseConvenienceState(input);
  const key = cleanKey(rawKey);
  if (!key || !PERSONAL_STATUSES.includes(status)) return state;
  const current = state.statuses[key] || { owned:false, tried:false, want:false, rebuy:false };
  return {
    ...state,
    statuses: {
      ...state.statuses,
      [key]: {
        owned: Boolean(current.owned),
        tried: Boolean(current.tried),
        want: Boolean(current.want),
        rebuy: Boolean(current.rebuy),
        [status]: !Boolean(current[status])
      }
    }
  };
}

export function toggleCompareKey(input, rawKey, max = MAX_COMPARE) {
  const state = normaliseConvenienceState(input);
  const key = cleanKey(rawKey);
  if (!key) return state;
  if (state.compare.includes(key)) {
    return { ...state, compare: state.compare.filter(item => item !== key) };
  }
  const cap = Math.max(1, Math.floor(Number(max) || MAX_COMPARE));
  if (state.compare.length >= cap) return state;
  return { ...state, compare: [...state.compare, key] };
}

export function retailerLabelForUrl(value) {
  try {
    const host = new URL(String(value || '')).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('cigarhut.com.au')) return 'CigarHut';
    if (host.includes('cigarworld.com.au')) return 'Cigarworld';
    if (host.includes('cigarbox.com.au')) return 'CigarBox';
    if (host.includes('firmincigars.com.au')) return 'Firmin Cigars';
    if (host.includes('theindexcigars.com.au')) return 'The Index';
    if (host.includes('ubercigar.com.au')) return 'Ubercigar';
    return host || 'Retailer';
  } catch (_) {
    return 'Retailer';
  }
}

function comparableUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    let result = url.toString();
    if (url.pathname !== '/' && result.endsWith('/')) result = result.slice(0, -1);
    return result.toLowerCase();
  } catch (_) {
    return '';
  }
}

export function matchRetailerStatus(result, url, label = retailerLabelForUrl(url)) {
  const rows = Array.isArray(result?.retailers) ? result.retailers : [];
  const targetUrl = comparableUrl(url);
  const targetLabel = String(label || '').trim().toLowerCase();
  let match = rows.find(item => targetUrl && comparableUrl(item?.url) === targetUrl);
  if (!match && targetLabel) {
    match = rows.find(item => String(item?.retailer || '').trim().toLowerCase() === targetLabel);
  }
  return ['in', 'out', 'delisted'].includes(match?.status) ? match.status : 'unknown';
}

export function readConvenienceState(storage = globalThis?.localStorage) {
  try {
    return normaliseConvenienceState(JSON.parse(storage?.getItem?.(STORAGE_KEY) || '{}'));
  } catch (_) {
    return normaliseConvenienceState();
  }
}

export function writeConvenienceState(state, storage = globalThis?.localStorage) {
  const normalised = normaliseConvenienceState(state);
  try { storage?.setItem?.(STORAGE_KEY, JSON.stringify(normalised)); } catch (_) {}
  return normalised;
}

export { STORAGE_KEY, PERSONAL_STATUSES, MAX_COMPARE };
