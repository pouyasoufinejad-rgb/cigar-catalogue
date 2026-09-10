const STORAGE_KEY = 'cigar-catalogue-convenience-v1';
const STYLE_ID = 'catalogue-convenience-style-v1';
const PERSONAL_STATUSES = Object.freeze(['owned', 'tried', 'want', 'rebuy']);
const PERSONAL_LABELS = Object.freeze({ owned:'Owned', tried:'Tried', want:'Want to Try', rebuy:'Rebuy' });
const PERSONAL_FILTERS = new Set(['all', ...PERSONAL_STATUSES]);
const VIEW_MODES = new Set(['compact', 'detailed']);
const MAX_COMPARE = 4;

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

export function cardMatchesPersonalFilter(input, rawKey) {
  const state = normaliseConvenienceState(input);
  const key = cleanKey(rawKey);
  if (state.personalFilter === 'all') return true;
  return Boolean(state.statuses[key]?.[state.personalFilter]);
}

export function isCardExpanded(input, rawKey) {
  const state = normaliseConvenienceState(input);
  const key = cleanKey(rawKey);
  if (state.viewMode === 'detailed') return !state.collapsedKeys.includes(key);
  return state.expandedKeys.includes(key);
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

let browserState = normaliseConvenienceState();
let refreshTimer = 0;

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.catalogue-convenience-toolbar{
  position:sticky;top:8px;z-index:45;
  display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
  margin:0 auto 16px;padding:9px 11px;width:min(100%,1180px);
  border:1px solid rgba(217,188,112,.32);border-radius:12px;
  background:rgba(10,9,7,.94);box-shadow:0 8px 28px rgba(0,0,0,.28);
  backdrop-filter:blur(10px);color:#eee;font:11px/1.25 system-ui,sans-serif;
}
.catalogue-convenience-toolbar .convenience-toolbar-group{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.catalogue-convenience-toolbar .convenience-toolbar-label{color:#cdbb8d;font-weight:700;margin-right:2px}
.catalogue-convenience-toolbar button,
.catalogue-personal-controls button,
.catalogue-card-actions button{
  appearance:none;border:1px solid rgba(217,188,112,.34);border-radius:999px;
  background:rgba(20,17,13,.9);color:#eee;padding:6px 9px;font:600 10px/1.1 system-ui,sans-serif;
  cursor:pointer;transition:border-color .14s ease,background .14s ease,color .14s ease,transform .14s ease;
}
.catalogue-convenience-toolbar button:hover,
.catalogue-personal-controls button:hover,
.catalogue-card-actions button:hover{border-color:rgba(217,188,112,.8)}
.catalogue-convenience-toolbar button[aria-pressed="true"],
.catalogue-personal-controls button[aria-pressed="true"],
.catalogue-card-actions button[aria-pressed="true"]{
  border-color:#d9bc70;background:rgba(217,188,112,.16);color:#f5dfaa;
}
.catalogue-personal-controls{display:flex;gap:5px;flex-wrap:wrap;margin:10px 0 6px}
.catalogue-card-actions{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:7px 0 4px}
.catalogue-card-actions .catalogue-compare-button{flex:1}
.catalogue-card-actions .catalogue-details-button{flex:1}
article.card[data-personal-filter-hidden="1"]{display:none!important}
article.card.convenience-compact .value-calc,
article.card.convenience-compact .tag-groups,
article.card.convenience-compact .summary,
article.card.convenience-compact .mog-note,
article.card.convenience-compact .artmeta,
article.card.convenience-compact .retailer-matrix,
article.card.convenience-compact .shop{display:none!important}
article.card.convenience-compact .cardbody{padding-bottom:12px!important}
body.catalogue-direct-edit-mode .catalogue-convenience-ui{display:none!important}
@media(max-width:700px){
  .catalogue-convenience-toolbar{top:4px;margin-bottom:10px;padding:8px}
  .catalogue-convenience-toolbar .convenience-toolbar-group{width:100%}
  .catalogue-personal-controls button,.catalogue-card-actions button{padding:6px 8px;font-size:9px}
}
`;
  document.head.appendChild(style);
}

function ensureToolbar() {
  let toolbar = document.getElementById('catalogue-convenience-toolbar');
  if (toolbar) return toolbar;
  toolbar = document.createElement('div');
  toolbar.id = 'catalogue-convenience-toolbar';
  toolbar.className = 'catalogue-convenience-toolbar catalogue-convenience-ui';
  toolbar.innerHTML = `<div class="convenience-toolbar-group"><span class="convenience-toolbar-label">Cards</span><button type="button" data-convenience-view>Detailed cards</button></div><div class="convenience-toolbar-group" data-personal-filters><span class="convenience-toolbar-label">Personal</span><button type="button" data-personal-filter="all">All</button>${PERSONAL_STATUSES.map(status => `<button type="button" data-personal-filter="${status}">${PERSONAL_LABELS[status]}</button>`).join('')}</div>`;
  const cards = document.getElementById('cards');
  const host = cards?.parentElement || document.querySelector('main') || document.body;
  if (cards?.parentElement === host) host.insertBefore(toolbar, cards);
  else host.prepend(toolbar);
  return toolbar;
}

function controlsMarkup() {
  return `<div class="catalogue-personal-controls catalogue-convenience-ui" aria-label="Personal cigar status">${PERSONAL_STATUSES.map(status => `<button type="button" data-personal-status="${status}" aria-pressed="false">${PERSONAL_LABELS[status]}</button>`).join('')}</div><div class="catalogue-card-actions catalogue-convenience-ui"><button type="button" class="catalogue-compare-button" data-convenience-compare aria-pressed="false">Compare</button><button type="button" class="catalogue-details-button" data-convenience-details>Details</button></div>`;
}

export function decorateCard(card) {
  if (!card?.querySelector || !cleanKey(card.dataset?.key)) return false;
  if (!card.querySelector('.catalogue-personal-controls')) {
    const facts = card.querySelector('.facts');
    const country = card.querySelector('.country-above');
    const anchor = facts || country || card.querySelector('h3');
    if (!anchor) return false;
    anchor.insertAdjacentHTML('afterend', controlsMarkup());
  }
  card.dataset.convenienceReady = '1';
  return true;
}

function cardStatus(key) {
  return browserState.statuses[key] || { owned:false, tried:false, want:false, rebuy:false };
}

function renderCard(card) {
  const key = cleanKey(card?.dataset?.key);
  if (!key) return;
  decorateCard(card);
  const status = cardStatus(key);
  card.querySelectorAll('[data-personal-status]').forEach(button => {
    const name = button.dataset.personalStatus;
    const active = Boolean(status[name]);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const compare = card.querySelector('[data-convenience-compare]');
  if (compare) compare.setAttribute('aria-pressed', browserState.compare.includes(key) ? 'true' : 'false');

  const expanded = isCardExpanded(browserState, key);
  card.classList.toggle('convenience-compact', !expanded);
  card.classList.toggle('convenience-expanded', expanded);
  const details = card.querySelector('[data-convenience-details]');
  if (details) details.textContent = expanded ? 'Collapse' : 'Details';

  if (cardMatchesPersonalFilter(browserState, key)) delete card.dataset.personalFilterHidden;
  else card.dataset.personalFilterHidden = '1';
}

function renderToolbar() {
  const toolbar = ensureToolbar();
  const view = toolbar.querySelector('[data-convenience-view]');
  if (view) {
    const detailed = browserState.viewMode === 'detailed';
    view.textContent = detailed ? 'Compact cards' : 'Detailed cards';
    view.setAttribute('aria-pressed', detailed ? 'true' : 'false');
  }
  toolbar.querySelectorAll('[data-personal-filter]').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.personalFilter === browserState.personalFilter ? 'true' : 'false');
  });
}

function refreshAll() {
  refreshTimer = 0;
  ensureStyles();
  renderToolbar();
  document.querySelectorAll('article.card[data-key]').forEach(renderCard);
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(refreshAll, 0);
}

function saveAndRefresh(next) {
  browserState = writeConvenienceState(next);
  refreshAll();
}

function toggleDisclosureForKey(key) {
  const expanded = isCardExpanded(browserState, key);
  const expandedKeys = new Set(browserState.expandedKeys);
  const collapsedKeys = new Set(browserState.collapsedKeys);
  if (browserState.viewMode === 'detailed') {
    expandedKeys.delete(key);
    if (expanded) collapsedKeys.add(key); else collapsedKeys.delete(key);
  } else {
    collapsedKeys.delete(key);
    if (expanded) expandedKeys.delete(key); else expandedKeys.add(key);
  }
  return { ...browserState, expandedKeys:[...expandedKeys], collapsedKeys:[...collapsedKeys] };
}

function onConvenienceClick(event) {
  const target = event.target?.closest?.('[data-personal-status],[data-convenience-compare],[data-convenience-details],[data-personal-filter],[data-convenience-view]');
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();

  const card = target.closest?.('article.card[data-key]');
  const key = cleanKey(card?.dataset?.key);
  if (target.dataset.personalStatus && key) {
    saveAndRefresh(togglePersonalStatus(browserState, key, target.dataset.personalStatus));
    return;
  }
  if (target.hasAttribute('data-convenience-compare') && key) {
    saveAndRefresh(toggleCompareKey(browserState, key));
    return;
  }
  if (target.hasAttribute('data-convenience-details') && key) {
    saveAndRefresh(toggleDisclosureForKey(key));
    return;
  }
  if (target.dataset.personalFilter) {
    saveAndRefresh({ ...browserState, personalFilter:target.dataset.personalFilter });
    return;
  }
  if (target.hasAttribute('data-convenience-view')) {
    saveAndRefresh({
      ...browserState,
      viewMode:browserState.viewMode === 'compact' ? 'detailed' : 'compact',
      expandedKeys:[],
      collapsedKeys:[]
    });
  }
}

function installObserver() {
  if (typeof MutationObserver === 'undefined' || !document.body) return;
  const observer = new MutationObserver(mutations => {
    const touchesCard = mutations.some(mutation => Array.from(mutation.addedNodes || []).some(node =>
      node?.nodeType === 1 && (node.matches?.('article.card[data-key]') || node.querySelector?.('article.card[data-key]'))
    ));
    if (touchesCard) scheduleRefresh();
  });
  observer.observe(document.body, { childList:true, subtree:true });
}

export function initCatalogueConvenience() {
  if (typeof document === 'undefined') return;
  browserState = readConvenienceState();
  ensureStyles();
  refreshAll();
  document.addEventListener('click', onConvenienceClick);
  document.addEventListener('catalogue:cards-refreshed', scheduleRefresh);
  installObserver();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCatalogueConvenience, { once:true });
  else initCatalogueConvenience();
}

export { STORAGE_KEY, PERSONAL_STATUSES, MAX_COMPARE };
