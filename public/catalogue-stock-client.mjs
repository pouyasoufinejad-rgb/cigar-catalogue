import { adminWriteFetch } from './catalogue-admin-unified-v139.mjs?v=145';

const STOCK_API = '/api/stock';
const STOCK_CHECK_API = '/api/stock/check';
const STALE_AFTER_DAYS = 21;
const CARD_LAYOUT_STYLE_ID = 'catalogue-card-layout-v146';

const panel = document.getElementById('live-stock-check');
const summary = document.getElementById('live-stock-summary');
const detail = document.getElementById('live-stock-detail');
const restockButton = document.getElementById('live-stock-now');
const fullButton = document.getElementById('live-stock-full');
const sort = document.getElementById('sort');
const sortSecondary = document.getElementById('sort-secondary');

let cards = [];
let cache = { results:{}, meta:{ lastRestockAt:0, lastFullAt:0 } };
let running = false;

const getCard = key => document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`);
const isoDate = date => date.toISOString().slice(0, 10);
const displayDate = date => date.toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
const stockPin = card => card ? (card.dataset.archived === '1' ? 'archived' : card.dataset.stockPin || '') : '';
const effectiveStatus = card => {
  if (!card) return 'unknown';
  const pin = stockPin(card);
  if (pin === 'in') return 'in';
  if (pin === 'out') return 'out';
  if (pin === 'hold') return 'unknown';
  return card.dataset.stock || 'unknown';
};
const isUnavailable = card => ['out','delisted'].includes(effectiveStatus(card));

function removeRedundantProductionLabels(root = document) {
  root.querySelectorAll('article.card .artmeta-left').forEach(production => {
    const title = production.querySelector('.artmeta-title');
    if (!title || title.textContent.trim().toLowerCase() !== 'production') return;
    production.querySelectorAll('.artmeta-line').forEach(line => {
      if (line.textContent.trim().toLowerCase() === 'unflavoured') line.remove();
    });
  });
}

function ensureCardLayoutStyles() {
  if (document.getElementById(CARD_LAYOUT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CARD_LAYOUT_STYLE_ID;
  style.textContent = `
:root{
  --catalogue-card-max-width:430px;
  --catalogue-artframe-min-height:390px;
}
.grid{
  grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))!important;
}
article.card{
  width:100%!important;
  max-width:var(--catalogue-card-max-width)!important;
  margin-inline:auto!important;
}
article.card .artframe{
  min-height:var(--catalogue-artframe-min-height)!important;
}
@media (max-width:700px){
  .grid{
    grid-template-columns:minmax(0, 1fr)!important;
  }
  article.card{
    width:100%!important;
    max-width:min(100%, var(--catalogue-card-max-width))!important;
  }
  article.card .artframe{
    min-height:410px!important;
  }
  article.card .artmeta-left,
  article.card .artmeta-right{
    max-width:46%!important;
    transform:translateY(14px)!important;
  }
}
`;
  document.head.appendChild(style);
}

function tidyCardPresentation(root = document) {
  ensureCardLayoutStyles();
  removeRedundantProductionLabels(root);
}

function setPanelState(state) {
  if (!panel) return;
  panel.classList.remove('is-running','has-restock','has-error');
  if (state) panel.classList.add(state);
}

function initialisePanel() {
  const heading = panel?.querySelector('.live-stock-copy > b');
  if (heading) heading.textContent = 'Live stock checks';
  if (summary) summary.textContent = 'Unavailable items are rechecked every 24 hours; a full catalogue sweep runs every 7 days.';
  if (restockButton) restockButton.textContent = 'Check stock now';
  if (fullButton) fullButton.textContent = 'Full sweep';
}

function ageDays(value) {
  if (!value) return Infinity;
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return Infinity;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function ensureFreshnessLines(card) {
  const row = card?.querySelector('.freshness');
  if (!row) return null;
  let checked = row.querySelector('.checked-state');
  if (!checked) {
    checked = document.createElement('span');
    checked.className = 'checked-state';
    row.appendChild(checked);
  }
  let priceLine = checked.querySelector('.price-checked-state');
  let stockLine = checked.querySelector('.stock-checked-state');
  if (!priceLine || !stockLine) {
    checked.textContent = '';
    priceLine = document.createElement('span');
    priceLine.className = 'price-checked-state';
    stockLine = document.createElement('span');
    stockLine.className = 'stock-checked-state';
    checked.append(priceLine, stockLine);
  }
  return { row, priceLine, stockLine, stockState:row.querySelector('.stock-state') };
}

function renderFreshness(card, status = effectiveStatus(card), retailerResults = []) {
  if (!card || stockPin(card)) return;
  const parts = ensureFreshnessLines(card);
  if (!parts) return;
  const { row, priceLine, stockLine, stockState } = parts;
  const priceChecked = card.dataset.priceChecked || '';
  const stockChecked = card.dataset.stockChecked || priceChecked;
  const priceStale = ageDays(priceChecked) > STALE_AFTER_DAYS;
  const stockStale = ageDays(stockChecked) > STALE_AFTER_DAYS;

  priceLine.textContent = priceChecked ? `Price checked ${displayDate(new Date(`${priceChecked}T00:00:00`))}` : 'Price check date unavailable';
  stockLine.textContent = stockChecked ? `Stock checked ${displayDate(new Date(`${stockChecked}T00:00:00`))}` : 'Stock check date unavailable';
  priceLine.classList.toggle('is-stale', priceStale);
  stockLine.classList.toggle('is-stale', stockStale);
  row.classList.toggle('price-stale', priceStale);
  row.classList.toggle('stock-stale', stockStale);
  row.classList.toggle('stale', priceStale || stockStale);
  row.classList.remove('live-stock-in','live-stock-out','live-stock-unknown','live-stock-delisted');
  row.classList.add(`live-stock-${['in','out','unknown','delisted'].includes(status) ? status : 'unknown'}`);

  const inRetailers = retailerResults.filter(item => item.status === 'in').map(item => item.retailer);
  const outRetailers = retailerResults.filter(item => item.status === 'out').map(item => item.retailer);
  const delistedRetailers = retailerResults.filter(item => item.status === 'delisted').map(item => item.retailer);
  if (stockState) {
    if (status === 'in') stockState.textContent = `In stock${inRetailers.length ? ` at ${inRetailers.join(' + ')}` : ''}`;
    else if (status === 'out') stockState.textContent = `Out of stock${outRetailers.length ? ` at ${outRetailers.join(' + ')}` : ''}`;
    else if (status === 'delisted') stockState.textContent = `Delisted at ${delistedRetailers.length ? delistedRetailers.join(' + ') : 'retailer'}`;
    else stockState.textContent = 'Page did not load';
  }
  const statusText = stockState?.textContent || 'Stock status';
  row.setAttribute('aria-label', `${statusText}; ${priceLine.textContent}; ${stockLine.textContent}`);
}

function applyStatus(card, saved, fromManualRun = false) {
  if (!card || stockPin(card) || !saved) return;
  const status = ['in','out','unknown','delisted'].includes(saved.status) ? saved.status : 'unknown';
  const previous = card.dataset.stock || 'unknown';
  card.classList.remove('live-restocked');
  if (status !== 'unknown') {
    card.dataset.stock = status;
    if (saved.checkedAt) card.dataset.stockChecked = isoDate(new Date(Number(saved.checkedAt)));
  }
  card.classList.toggle('is-delisted', status === 'delisted');
  if (fromManualRun && status === 'in' && ['out','delisted'].includes(previous)) card.classList.add('live-restocked');
  renderFreshness(card, status === 'unknown' ? effectiveStatus(card) : status, Array.isArray(saved.retailers) ? saved.retailers : []);
}

function getUnavailableArea(kind) {
  const isTaster = kind === 'taster';
  const section = isTaster ? document.getElementById('tasters-section') : document.getElementById('cards')?.closest('.section');
  if (!section) return null;
  const gridId = `v123-unavailable-${kind}-grid`;
  let grid = document.getElementById(gridId);
  let divider = section.querySelector(`.unavailable-divider[data-section="${kind}"]`);
  if (!divider) {
    divider = document.createElement('div');
    divider.className = 'unavailable-divider';
    divider.dataset.section = kind;
    divider.innerHTML = '<span>Currently unavailable</span>';
  }
  if (!grid) {
    grid = document.createElement('div');
    grid.id = gridId;
    grid.className = 'grid unavailable-grid';
    grid.dataset.section = kind;
  }
  if (isTaster) section.append(divider, grid);
  else document.getElementById('cards')?.append(divider, grid);
  return { divider, grid };
}

function activeFilter() {
  return document.querySelector('.toggle button[data-filter].active')?.dataset.filter || 'instock';
}

function updateDividerVisibility() {
  const filter = activeFilter();
  document.querySelectorAll('.unavailable-divider').forEach(divider => {
    const kind = divider.dataset.section;
    const grid = document.getElementById(`v123-unavailable-${kind}-grid`);
    const visibleUnavailable = grid ? Array.from(grid.querySelectorAll('.card')).some(card => !card.classList.contains('hidden')) : false;
    divider.classList.toggle('hidden', filter === 'instock' || !visibleUnavailable);
    if (grid) grid.classList.toggle('hidden', !visibleUnavailable);
  });
}

function separateUnavailableCards() {
  cards = Array.from(document.querySelectorAll('article.card[data-key]'));
  cards.forEach(card => {
    const unavailable = isUnavailable(card);
    card.classList.toggle('is-unavailable', unavailable);
    card.classList.toggle('is-delisted', card.dataset.stock === 'delisted');
  });
  const mainUnavailable = cards.filter(card => card.dataset.archived !== '1' && card.dataset.taster !== '1' && isUnavailable(card));
  const tasterUnavailable = cards.filter(card => card.dataset.archived !== '1' && card.dataset.taster === '1' && isUnavailable(card));
  const syncSection = (kind, unavailableCards) => {
    const divider = document.querySelector(`.unavailable-divider[data-section="${kind}"]`);
    const grid = document.getElementById(`v123-unavailable-${kind}-grid`);
    if (!unavailableCards.length) {
      divider?.remove();
      grid?.remove();
      return;
    }
    const area = getUnavailableArea(kind);
    unavailableCards.forEach(card => area?.grid.appendChild(card));
  };
  syncSection('main', mainUnavailable);
  syncSection('taster', tasterUnavailable);
  updateDividerVisibility();
}

function restoreAndSeparate() {
  if (typeof window.reorder === 'function') window.reorder();
  separateUnavailableCards();
  if (typeof window.applyCatalogueFilter === 'function') window.applyCatalogueFilter(activeFilter());
  updateDividerVisibility();
}

function updateMetaText() {
  if (!detail) return;
  const restock = Number(cache.meta?.lastRestockAt) || 0;
  const full = Number(cache.meta?.lastFullAt) || 0;
  const restockText = restock ? displayDate(new Date(restock)) : 'not yet';
  const fullText = full ? displayDate(new Date(full)) : 'not yet';
  detail.textContent = `Unavailable items recheck every 24 hours; full sweep every 7 days. Last restock check: ${restockText}. Last full sweep: ${fullText}.`;
}

function applyCachedResults(fromManualRun = false) {
  cards = Array.from(document.querySelectorAll('article.card[data-key]'));
  cards.forEach(card => {
    if (!stockPin(card) && !card.dataset.stockChecked) card.dataset.stockChecked = card.dataset.priceChecked || '';
    const saved = cache.results?.[card.dataset.key];
    if (saved) applyStatus(card, saved, fromManualRun);
    else renderFreshness(card, effectiveStatus(card), []);
  });
  tidyCardPresentation();
  restoreAndSeparate();
  updateMetaText();
}

async function loadStock({ fromManualRun = false } = {}) {
  const response = await fetch(STOCK_API, { cache:'no-store', headers:{ accept:'application/json' } });
  if (!response.ok) throw new Error(`Stock cache HTTP ${response.status}`);
  const payload = await response.json();
  cache = {
    results:payload?.results && typeof payload.results === 'object' ? payload.results : {},
    meta:payload?.meta && typeof payload.meta === 'object' ? payload.meta : { lastRestockAt:0, lastFullAt:0 }
  };
  applyCachedResults(fromManualRun);
  return cache;
}

function passSummary(run) {
  const counters = run?.counters || {};
  const candidates = Array.isArray(counters.delistingCandidates) ? counters.delistingCandidates : [];
  const candidateNoun = candidates.length === 1 ? 'delisting candidate' : 'delisting candidates';
  const failed = Number(counters.failed) || 0;
  const failedNoun = failed === 1 ? 'page failed' : 'pages failed';
  const names = candidates.length ? ` Candidates: ${candidates.join(', ')}.` : '';
  return `Category sweep resolved ${Number(counters.sweepResolved) || 0}, ${candidates.length} ${candidateNoun}, ${failed} ${failedNoun}.${names}`;
}

async function runCheck(mode) {
  if (running) return;
  running = true;
  const isFull = mode === 'full';
  [restockButton, fullButton].forEach(button => { if (button) button.disabled = true; });
  if (restockButton) restockButton.textContent = 'Checking…';
  if (fullButton) fullButton.textContent = isFull ? 'Sweeping…' : 'Full sweep';
  setPanelState('is-running');
  if (summary) summary.textContent = isFull ? 'Running full retailer sweep…' : 'Rechecking unavailable items…';

  try {
    const response = await adminWriteFetch(STOCK_CHECK_API, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ mode })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Stock check HTTP ${response.status}`);
    cache = {
      results:payload?.results && typeof payload.results === 'object' ? payload.results : cache.results,
      meta:payload?.meta && typeof payload.meta === 'object' ? payload.meta : cache.meta
    };
    applyCachedResults(true);
    if (summary) summary.textContent = Number(payload.checked) === 0
      ? (isFull ? 'Full sweep complete: no retailer links required checking.' : 'No unavailable cards currently need a restock check.')
      : passSummary(payload);
    if (Array.isArray(payload.restocked) && payload.restocked.length) {
      setPanelState('has-restock');
      const names = payload.restocked.map(key => getCard(key)?.querySelector('h3')?.textContent.trim() || key);
      if (detail) detail.textContent = `Available again: ${names.join(', ')}. Unavailable items recheck every 24 hours; full sweep every 7 days.`;
    } else if ((Number(payload.counters?.failed) || 0) > 0 && !(Number(payload.counters?.productResolved) || 0) && !(Number(payload.counters?.sweepResolved) || 0)) {
      setPanelState('has-error');
      if (detail) detail.textContent = 'Retailer pages did not load. The last confirmed stock states were retained.';
    } else {
      setPanelState('');
      updateMetaText();
    }
  } catch (error) {
    setPanelState('has-error');
    if (summary) summary.textContent = 'Stock check failed.';
    if (detail) detail.textContent = error?.message || String(error);
  } finally {
    if (restockButton) { restockButton.disabled = false; restockButton.textContent = 'Check stock now'; }
    if (fullButton) { fullButton.disabled = false; fullButton.textContent = 'Full sweep'; }
    running = false;
  }
}

async function init() {
  try { if (window.catalogueOverridesReady) await window.catalogueOverridesReady; } catch (_) {}
  initialisePanel();
  tidyCardPresentation();
  cards = Array.from(document.querySelectorAll('article.card[data-key]'));
  try { await loadStock(); }
  catch (error) {
    setPanelState('has-error');
    if (detail) detail.textContent = `Could not load stock cache: ${error?.message || error}`;
    applyCachedResults();
  }

  // The previous client made "In stock" the effective initial filter after startup.
  document.querySelectorAll('.toggle button[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === 'instock'));
  if (typeof window.applyCatalogueFilter === 'function') window.applyCatalogueFilter('instock');
  updateDividerVisibility();

  restockButton?.addEventListener('click', () => runCheck('restock'));
  fullButton?.addEventListener('click', () => runCheck('full'));
  [sort, sortSecondary].forEach(control => control?.addEventListener('change', () => setTimeout(restoreAndSeparate, 0)));
  document.querySelectorAll('.toggle button[data-filter]').forEach(button => button.addEventListener('click', () => setTimeout(updateDividerVisibility, 0)));
  document.addEventListener('catalogue:cards-refreshed', () => {
    cards = Array.from(document.querySelectorAll('article.card[data-key]'));
    tidyCardPresentation();
    applyCachedResults();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
else init();