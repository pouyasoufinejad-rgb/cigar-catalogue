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
let toastTimer = 0;

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
.catalogue-card-actions button,
.catalogue-compare-tray button,
.catalogue-compare-dialog button{
  appearance:none;border:1px solid rgba(217,188,112,.34);border-radius:999px;
  background:rgba(20,17,13,.9);color:#eee;padding:6px 9px;font:600 10px/1.1 system-ui,sans-serif;
  cursor:pointer;transition:border-color .14s ease,background .14s ease,color .14s ease,transform .14s ease;
}
.catalogue-convenience-toolbar button:hover,
.catalogue-personal-controls button:hover,
.catalogue-card-actions button:hover,
.catalogue-compare-tray button:hover,
.catalogue-compare-dialog button:hover{border-color:rgba(217,188,112,.8)}
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
.catalogue-compare-tray{
  position:fixed;z-index:9992;left:50%;bottom:12px;transform:translateX(-50%);
  display:flex;align-items:center;gap:8px;width:min(94vw,520px);padding:9px 10px;
  border:1px solid rgba(217,188,112,.58);border-radius:13px;background:rgba(10,9,7,.97);
  box-shadow:0 14px 38px rgba(0,0,0,.55);color:#eee;font:11px/1.25 system-ui,sans-serif;
}
.catalogue-compare-tray[hidden]{display:none!important}
.catalogue-compare-tray .catalogue-compare-count{flex:1;color:#d8cba9}
.catalogue-compare-tray .catalogue-compare-count b{color:#f2d894;font-size:13px}
body.catalogue-compare-tray-active{padding-bottom:72px!important}
.catalogue-compare-overlay{position:fixed;z-index:10020;inset:0;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.76);backdrop-filter:blur(5px)}
.catalogue-compare-overlay[hidden]{display:none!important}
.catalogue-compare-dialog{width:min(96vw,1180px);max-height:92vh;overflow:hidden;border:1px solid rgba(217,188,112,.62);border-radius:16px;background:#0d0b09;color:#eee;box-shadow:0 24px 80px rgba(0,0,0,.75);font:12px/1.4 system-ui,sans-serif}
.catalogue-compare-header{display:flex;align-items:center;gap:12px;padding:13px 15px;border-bottom:1px solid rgba(217,188,112,.2)}
.catalogue-compare-header h2{flex:1;margin:0;color:#ead49b;font:700 17px/1.2 Georgia,serif}
.catalogue-compare-scroll{overflow:auto;max-height:calc(92vh - 58px);padding:0 0 12px}
.catalogue-compare-table{display:grid;min-width:max-content;grid-template-columns:130px repeat(var(--compare-count),minmax(210px,1fr));align-items:stretch}
.catalogue-compare-cell{padding:10px 12px;border-right:1px solid rgba(217,188,112,.12);border-bottom:1px solid rgba(255,255,255,.07);min-width:0}
.catalogue-compare-cell.compare-label{position:sticky;left:0;z-index:2;background:#12100d;color:#bfae83;font-weight:700}
.catalogue-compare-product{display:flex;gap:9px;align-items:center;min-height:94px}
.catalogue-compare-product img{width:72px;height:88px;object-fit:contain;background:#050505;border-radius:7px}
.catalogue-compare-product b{display:block;color:#f0dfb1;font:700 13px/1.25 Georgia,serif}
.catalogue-convenience-toast{position:fixed;z-index:10040;left:50%;bottom:82px;transform:translateX(-50%);padding:8px 11px;border:1px solid rgba(217,188,112,.52);border-radius:999px;background:#17130e;color:#f1e5c7;font:600 11px/1.2 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5)}
body.catalogue-direct-edit-mode .catalogue-convenience-ui{display:none!important}
@media(max-width:700px){
  .catalogue-convenience-toolbar{top:4px;margin-bottom:10px;padding:8px}
  .catalogue-convenience-toolbar .convenience-toolbar-group{width:100%}
  .catalogue-personal-controls button,.catalogue-card-actions button{padding:6px 8px;font-size:9px}
  .catalogue-compare-overlay{padding:8px}
  .catalogue-compare-dialog{width:98vw;max-height:96vh}
  .catalogue-compare-scroll{max-height:calc(96vh - 58px)}
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

function ensureCompareTray() {
  let tray = document.getElementById('catalogue-compare-tray');
  if (tray) return tray;
  tray = document.createElement('div');
  tray.id = 'catalogue-compare-tray';
  tray.className = 'catalogue-compare-tray catalogue-convenience-ui';
  tray.hidden = true;
  tray.innerHTML = `<span class="catalogue-compare-count"><b data-compare-count>0</b> selected · up to ${MAX_COMPARE}</span><button type="button" data-compare-open>Compare</button><button type="button" data-compare-clear>Clear</button>`;
  document.body.appendChild(tray);
  return tray;
}

function ensureCompareOverlay() {
  let overlay = document.getElementById('catalogue-compare-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'catalogue-compare-overlay';
  overlay.className = 'catalogue-compare-overlay catalogue-convenience-ui';
  overlay.hidden = true;
  overlay.innerHTML = `<section class="catalogue-compare-dialog" role="dialog" aria-modal="true" aria-labelledby="catalogue-compare-title"><header class="catalogue-compare-header"><h2 id="catalogue-compare-title">Compare selected cigars</h2><button type="button" data-compare-close aria-label="Close comparison">Close</button></header><div class="catalogue-compare-scroll" data-compare-content></div></section>`;
  document.body.appendChild(overlay);
  return overlay;
}

function renderCompareTray() {
  const tray = ensureCompareTray();
  const count = browserState.compare.length;
  tray.hidden = count === 0;
  const countNode = tray.querySelector('[data-compare-count]');
  if (countNode) countNode.textContent = String(count);
  document.body.classList.toggle('catalogue-compare-tray-active', count > 0);
}

function ratingValue(card, label) {
  const node = Array.from(card?.querySelectorAll?.('.rating') || []).find(item =>
    item.querySelector(':scope > span')?.textContent?.trim().toLowerCase() === label.toLowerCase()
  );
  if (!node) return '—';
  const score = node.querySelector('.subscore')?.textContent?.trim();
  const tier = node.querySelector('b')?.textContent?.trim();
  if (score && score !== '—') return tier ? `${score} · ${tier}` : score;
  return tier || score || '—';
}

function factText(card, index) {
  const node = card?.querySelectorAll?.('.facts > div')?.[index];
  if (!node) return '—';
  const primary = node.querySelector('b')?.textContent?.trim() || '';
  const secondary = node.querySelector('small')?.textContent?.trim() || '';
  return [primary, secondary].filter(Boolean).join(' · ') || '—';
}

function effectiveStockText(card) {
  const pin = String(card?.dataset?.stockPin || '').toLowerCase();
  const value = ['in', 'out'].includes(pin) ? pin : String(card?.dataset?.stock || 'unknown').toLowerCase();
  if (value === 'in') return 'In stock';
  if (value === 'out') return 'Out of stock';
  if (value === 'delisted') return 'Delisted';
  return 'Unknown';
}

function personalStatusText(key) {
  const status = cardStatus(key);
  const active = PERSONAL_STATUSES.filter(name => status[name]).map(name => PERSONAL_LABELS[name]);
  return active.length ? active.join(' · ') : '—';
}

function cardTitle(card) {
  const heading = card?.querySelector('h3');
  if (!heading) return card?.dataset?.key || 'Cigar';
  return heading.textContent.replace(/\s+/g, ' ').trim();
}

function compareSnapshot(card) {
  const key = cleanKey(card?.dataset?.key);
  const image = card?.querySelector('.artframe img');
  const production = Array.from(card?.querySelectorAll?.('.artmeta-left .artmeta-line') || []).map(node => node.textContent.trim()).filter(Boolean).join(' · ');
  const smoke = card?.querySelector('.artmeta-bottom')?.textContent?.trim() || '—';
  const perStick = Number(card?.dataset?.price);
  return {
    key,
    title:cardTitle(card),
    imageSrc:image?.currentSrc || image?.src || '',
    imageAlt:image?.alt || cardTitle(card),
    price:Number.isFinite(perStick) ? `A$${Number.isInteger(perStick) ? perStick.toFixed(0) : perStick.toFixed(2)}` : factText(card, 1).split(' · ')[0],
    package:factText(card, 0),
    dimensions:card?.querySelector('.facts .size-only b')?.textContent?.trim() || factText(card, 2).split(' · ')[0] || '—',
    strength:ratingValue(card, 'Strength'),
    quality:ratingValue(card, 'Quality'),
    flavour:ratingValue(card, 'Flavour'),
    size:ratingValue(card, 'Size'),
    value:ratingValue(card, 'Value'),
    smokeTime:smoke,
    stock:effectiveStockText(card),
    personalStatus:personalStatusText(key),
    production:production || '—'
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function compareProductCell(item) {
  const image = item.imageSrc ? `<img src="${escapeHtml(item.imageSrc)}" alt="${escapeHtml(item.imageAlt)}">` : '';
  return `<div class="catalogue-compare-cell"><div class="catalogue-compare-product">${image}<b>${escapeHtml(item.title)}</b></div></div>`;
}

function compareFieldRow(label, items, property) {
  return `<div class="catalogue-compare-cell compare-label">${escapeHtml(label)}</div>${items.map(item => `<div class="catalogue-compare-cell">${escapeHtml(item[property] || '—')}</div>`).join('')}`;
}

function openCompareOverlay() {
  const overlay = ensureCompareOverlay();
  const items = browserState.compare.map(key => document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`)).filter(Boolean).map(compareSnapshot);
  const content = overlay.querySelector('[data-compare-content]');
  if (!items.length) {
    if (content) content.innerHTML = '<div class="catalogue-compare-cell">No selected cigars are currently visible.</div>';
  } else if (content) {
    const fields = [
      ['Price / stick', 'price'],
      ['Package', 'package'],
      ['Dimensions', 'dimensions'],
      ['Strength', 'strength'],
      ['Quality', 'quality'],
      ['Flavour', 'flavour'],
      ['Size', 'size'],
      ['Value', 'value'],
      ['Smoke time', 'smokeTime'],
      ['Stock', 'stock'],
      ['Personal status', 'personalStatus'],
      ['Production', 'production']
    ];
    content.innerHTML = `<div class="catalogue-compare-table" style="--compare-count:${items.length}"><div class="catalogue-compare-cell compare-label">Cigar</div>${items.map(compareProductCell).join('')}${fields.map(([label, property]) => compareFieldRow(label, items, property)).join('')}</div>`;
  }
  overlay.hidden = false;
  overlay.querySelector('[data-compare-close]')?.focus?.();
}

function closeCompareOverlay() {
  const overlay = document.getElementById('catalogue-compare-overlay');
  if (overlay) overlay.hidden = true;
}

function showToast(message) {
  let toast = document.getElementById('catalogue-convenience-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'catalogue-convenience-toast';
    toast.className = 'catalogue-convenience-toast catalogue-convenience-ui';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

function refreshAll() {
  refreshTimer = 0;
  ensureStyles();
  renderToolbar();
  document.querySelectorAll('article.card[data-key]').forEach(renderCard);
  renderCompareTray();
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
  const target = event.target?.closest?.('[data-personal-status],[data-convenience-compare],[data-convenience-details],[data-personal-filter],[data-convenience-view],[data-compare-open],[data-compare-clear],[data-compare-close]');
  if (!target) {
    if (event.target?.id === 'catalogue-compare-overlay') closeCompareOverlay();
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  const card = target.closest?.('article.card[data-key]');
  const key = cleanKey(card?.dataset?.key);
  if (target.dataset.personalStatus && key) {
    saveAndRefresh(togglePersonalStatus(browserState, key, target.dataset.personalStatus));
    return;
  }
  if (target.hasAttribute('data-convenience-compare') && key) {
    const wasSelected = browserState.compare.includes(key);
    const next = toggleCompareKey(browserState, key);
    if (!wasSelected && next.compare.length === browserState.compare.length) {
      showToast('You can compare up to 4 cigars');
      return;
    }
    saveAndRefresh(next);
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
    return;
  }
  if (target.hasAttribute('data-compare-open')) {
    openCompareOverlay();
    return;
  }
  if (target.hasAttribute('data-compare-clear')) {
    saveAndRefresh({ ...browserState, compare:[] });
    closeCompareOverlay();
    return;
  }
  if (target.hasAttribute('data-compare-close')) closeCompareOverlay();
}

function onKeydown(event) {
  if (event.key === 'Escape') closeCompareOverlay();
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
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('catalogue:cards-refreshed', scheduleRefresh);
  installObserver();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCatalogueConvenience, { once:true });
  else initCatalogueConvenience();
}

export { STORAGE_KEY, PERSONAL_STATUSES, MAX_COMPARE };
