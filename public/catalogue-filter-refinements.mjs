const STATE_API = '/api/catalogue-overrides';
const STYLE_ID = 'catalogue-filter-refinements-style-v1';
const RETAILER_SELECT_ID = 'catalogue-retailer-filter';

const PRICE_MODES = Object.freeze({
  under10: { label:'Under A$15', min:0, max:15, includeMax:false },
  tenplus: { label:'A$15–35', min:15, max:35, includeMax:false },
  stretch: { label:'A$35–60', min:35, max:60, includeMax:true }
});

const RETAILER_LABELS = Object.freeze({
  'cigarhut.com.au':'CigarHut',
  'cigarworld.com.au':'Cigarworld',
  'cigarbox.com.au':'CigarBox',
  'theindexcigars.com.au':'The Index',
  'firmincigars.com.au':'Firmin Cigars',
  'corporatecigar.com.au':'Corporate Cigar',
  'sydneycigarhouse.com.au':'Sydney Cigar House',
  'devlins.com.au':"Devlin's",
  'cigaria.com.au':'Cigaria',
  'ubercigar.com.au':'Ubercigar',
  'smokingpipes.com':'SmokingPipes',
  'samscigars.com.au':"Sam's Smokes"
});

let activeMode = 'all';
let activeRetailer = '';
let retailerHostsByKey = new Map();
let liveState = null;
let refreshTimer = 0;

function cleanHost(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '');
}

export function retailerHost(value) {
  try {
    return cleanHost(new URL(String(value || '')).hostname);
  } catch (_) {
    return '';
  }
}

export function retailerLabel(host) {
  const clean = cleanHost(host);
  if (RETAILER_LABELS[clean]) return RETAILER_LABELS[clean];
  if (!clean) return 'Retailer';
  const stem = clean.split('.')[0].replace(/[-_]+/g, ' ');
  return stem.replace(/\b\w/g, letter => letter.toUpperCase());
}

export function priceMatches(mode, value) {
  const band = PRICE_MODES[mode];
  if (!band) return true;
  const price = Number(value);
  if (!Number.isFinite(price)) return false;
  if (price < band.min) return false;
  return band.includeMax ? price <= band.max : price < band.max;
}

export function collectRetailerHosts(value, output = new Set(), seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach(item => collectRetailerHosts(item, output, seen));
    return output;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'retailerLinks' && Array.isArray(child)) {
      child.forEach(url => {
        const host = retailerHost(typeof url === 'string' ? url : url?.url);
        if (host) output.add(host);
      });
      continue;
    }
    collectRetailerHosts(child, output, seen);
  }
  return output;
}

function cardKey(card) {
  return String(card?.dataset?.key || '').trim();
}

function cardRetailerHosts(card) {
  const hosts = new Set(retailerHostsByKey.get(cardKey(card)) || []);
  card?.querySelectorAll?.('a.shop[href], .retailer-matrix a[href]').forEach(link => {
    const host = retailerHost(link.href || link.getAttribute('href'));
    if (host) hosts.add(host);
  });
  return hosts;
}

export function cardMatchesRetailer(card, host) {
  const clean = cleanHost(host);
  if (!clean) return true;
  return cardRetailerHosts(card).has(clean);
}

function isArchived(card) {
  return card?.dataset?.archived === '1';
}

function currentButtons(root = document) {
  return Array.from(root.querySelectorAll?.('.controls .toggle button[data-filter]') || []);
}

function setActiveButton(root = document) {
  currentButtons(root).forEach(button => {
    button.classList.toggle('active', button.dataset.filter === activeMode);
  });
}

function applyRefinedVisibility(root = document, view = globalThis.window) {
  const cards = Array.from(root.querySelectorAll?.('article.card[data-key]') || []);
  cards.forEach(card => {
    if (isArchived(card)) return;

    if (PRICE_MODES[activeMode]) {
      const unavailable = card.dataset.stock === 'out' || card.dataset.stock === 'delisted';
      const visibleByPrice = !unavailable && priceMatches(activeMode, card.dataset.price);
      card.classList.toggle('hidden', !visibleByPrice);
    }

    if (activeRetailer && !cardMatchesRetailer(card, activeRetailer)) {
      card.classList.add('hidden');
    }
  });

  setActiveButton(root);
  view?.refreshGroupVisibility?.();
}

function reapply(root = document, view = globalThis.window) {
  if (typeof view?.applyCatalogueFilter === 'function') {
    view.applyCatalogueFilter(activeMode);
  }
  applyRefinedVisibility(root, view);
}

function stateRecordForKey(state, key) {
  if (!state || !key) return null;
  const card = state.cards?.[key];
  const entry = state.entries?.[key];
  if (!card && !entry) return null;
  return { ...(card || {}), ...(entry || {}) };
}

function rebuildRetailerIndex(root = document) {
  const next = new Map();

  for (const card of Array.from(root.querySelectorAll?.('article.card[data-key]') || [])) {
    const key = cardKey(card);
    if (!key) continue;
    const hosts = new Set();

    card.querySelectorAll?.('a.shop[href], .retailer-matrix a[href]').forEach(link => {
      const host = retailerHost(link.href || link.getAttribute('href'));
      if (host) hosts.add(host);
    });

    const stored = stateRecordForKey(liveState, key);
    if (stored) collectRetailerHosts(stored, hosts);

    next.set(key, hosts);
  }

  retailerHostsByKey = next;
  return next;
}

function discoveredRetailers() {
  const hosts = new Set();
  retailerHostsByKey.forEach(values => values.forEach(host => hosts.add(host)));
  return Array.from(hosts).sort((left, right) =>
    retailerLabel(left).localeCompare(retailerLabel(right))
  );
}

function populateRetailerSelect(select) {
  if (!select) return;
  const retailers = discoveredRetailers();
  const selected = activeRetailer;
  select.replaceChildren();

  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All retailers';
  select.appendChild(all);

  retailers.forEach(host => {
    const option = document.createElement('option');
    option.value = host;
    option.textContent = retailerLabel(host);
    select.appendChild(option);
  });

  if (selected && retailers.includes(selected)) select.value = selected;
  else {
    activeRetailer = '';
    select.value = '';
  }
}

function ensureRetailerControl(root = document) {
  const controls = root.querySelector?.('.controls');
  if (!controls) return null;

  let select = root.getElementById?.(RETAILER_SELECT_ID);
  if (select) return select;

  const label = root.createElement('label');
  label.className = 'catalogue-retailer-filter';
  label.append('Retailer');

  select = root.createElement('select');
  select.id = RETAILER_SELECT_ID;
  select.setAttribute('aria-label', 'Filter by retailer');
  label.appendChild(select);

  controls.appendChild(label);
  select.addEventListener('change', () => {
    activeRetailer = cleanHost(select.value);
    reapply(root, root.defaultView || globalThis.window);
  });
  return select;
}

function refinePriceButtons(root = document) {
  const buttons = currentButtons(root);

  for (const [mode, band] of Object.entries(PRICE_MODES)) {
    const button = buttons.find(item => item.dataset.filter === mode);
    if (button) button.textContent = band.label;
  }

  const premium = buttons.find(item => item.dataset.filter === 'premium');
  if (premium) premium.remove();
}

function ensureStyles(root = document) {
  if (root.getElementById?.(STYLE_ID)) return;
  const style = root.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.catalogue-retailer-filter{
  display:block;
  width:100%;
  margin-top:2px;
  font-family:inherit;
}
.catalogue-retailer-filter select{
  width:100%;
  box-sizing:border-box;
}
`;
  (root.head || root.documentElement).appendChild(style);
}

function scheduleRebuild(root = document, view = globalThis.window) {
  if (refreshTimer) return;
  refreshTimer = view?.setTimeout?.(() => {
    refreshTimer = 0;
    rebuildRetailerIndex(root);
    populateRetailerSelect(root.getElementById?.(RETAILER_SELECT_ID));
    reapply(root, view);
  }, 0) || 0;
}

async function loadLiveState(root = document, view = globalThis.window, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return;
  try {
    const response = await fetchImpl(STATE_API, { cache:'no-store', headers:{ accept:'application/json' } });
    if (!response?.ok) return;
    liveState = await response.json();
    scheduleRebuild(root, view);
  } catch (_) {}
}

function onFilterClick(event, root, view) {
  const button = event.target?.closest?.('.controls .toggle button[data-filter]');
  if (!button) return;
  activeMode = button.dataset.filter || 'all';
  view?.setTimeout?.(() => applyRefinedVisibility(root, view), 0);
}

export function installCatalogueFilterRefinements(
  root = document,
  view = globalThis.window,
  fetchImpl = globalThis.fetch
) {
  if (!root?.querySelector) return false;

  ensureStyles(root);
  refinePriceButtons(root);

  const active = currentButtons(root).find(button => button.classList.contains('active'));
  activeMode = active?.dataset?.filter || 'all';

  rebuildRetailerIndex(root);
  const select = ensureRetailerControl(root);
  populateRetailerSelect(select);

  root.addEventListener('click', event => onFilterClick(event, root, view));
  root.addEventListener('catalogue:cards-refreshed', () => scheduleRebuild(root, view));
  root.addEventListener('catalogue:variant-changed', () => scheduleRebuild(root, view));

  loadLiveState(root, view, fetchImpl);
  applyRefinedVisibility(root, view);
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installCatalogueFilterRefinements(document, window), { once:true });
  } else {
    installCatalogueFilterRefinements(document, window);
  }
}

export { PRICE_MODES, RETAILER_LABELS, RETAILER_SELECT_ID };
