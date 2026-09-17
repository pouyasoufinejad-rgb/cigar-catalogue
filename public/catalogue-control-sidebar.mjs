import { BRAND_LINE_CONFIG } from './catalogue-brand-line-config.mjs';

const STYLE_ID = 'catalogue-control-sidebar-style-v6';
const SIDEBAR_ID = 'catalogue-control-sidebar';
const EXTRA_ID = 'catalogue-sidebar-extra-controls';
const DESKTOP_QUERY = '(min-width: 1660px)';
const BRAND_LINE_QUERY_PARAM = 'brandLine';
const STATE_API = '/api/catalogue-overrides';
const IMAGE_API = '/api/catalogue-image/';
const ADMIN_TOKEN_SESSION_KEY = 'cigar-catalogue-admin-token';
const MAX_LOGO_BYTES = 12 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DEFAULT_LOGO_SETTINGS = Object.freeze({ size:24, x:0, y:0 });
const placements = new WeakMap();
const catalogueStateByRoot = new WeakMap();
let adminTokenMemory = '';

export { BRAND_LINE_CONFIG };

export const CATALOGUE_JUMPS = Object.freeze([
  Object.freeze({ id:'coronets-cigarillos', label:'Coronets & Cigarillos' }),
  Object.freeze({ id:'petit-panatelas', label:'Petit Panatelas, Petit Coronas & Petit Robustos' }),
  Object.freeze({ id:'flavoured-infused', label:'Flavoured & Infused Cigars' })
]);

function rememberPlacement(node) {
  if (!node?.parentNode || placements.has(node)) return;
  const marker = node.ownerDocument.createComment(` ${SIDEBAR_ID} origin `);
  node.parentNode.insertBefore(marker, node);
  placements.set(node, marker);
}

function restoreNode(node) {
  const marker = placements.get(node);
  if (!marker?.parentNode) return;
  marker.parentNode.insertBefore(node, marker.nextSibling);
  marker.remove();
  placements.delete(node);
}

function ensureSidebar(root = document) {
  let sidebar = root.getElementById?.(SIDEBAR_ID);
  if (sidebar) return sidebar;
  sidebar = root.createElement('aside');
  sidebar.id = SIDEBAR_ID;
  sidebar.className = 'catalogue-control-sidebar';
  sidebar.setAttribute('aria-label', 'Catalogue controls');
  (root.body || root.documentElement).appendChild(sidebar);
  return sidebar;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function cardBrand(card) {
  return cleanText(
    card?.dataset?.brand ||
    card?.querySelector?.('h3 > span, h3 > small')?.textContent ||
    ''
  );
}

function archivedFromState(card, state) {
  const key = cleanText(card?.dataset?.key);
  if (!key || !state || typeof state !== 'object') return null;
  const entry = state.entries?.[key];
  if (entry && own(entry, 'archived')) return Boolean(entry.archived);
  const override = state.cards?.[key];
  if (override && own(override, 'archived')) return Boolean(override.archived);
  return null;
}

function isArchived(card, state = null) {
  const authoritative = archivedFromState(card, state);
  return authoritative === null ? card?.dataset?.archived === '1' : authoritative;
}

function allCardsForRoot(root) {
  return Array.from(root.querySelectorAll?.('article.card[data-key]') || []);
}

function activeCardsForRoot(root, state = catalogueStateByRoot.get(root)) {
  return allCardsForRoot(root).filter(card => !isArchived(card, state));
}

function descriptorMatchesCard(card, descriptor) {
  if (!descriptor || descriptor.id === 'all') return true;
  const brand = cardBrand(card).toLowerCase();
  return Array.from(descriptor.brands || [])
    .map(value => cleanText(value).toLowerCase())
    .filter(Boolean)
    .includes(brand);
}

function configuredBrandForLabel(label) {
  const normal = cleanText(label).toLowerCase();
  return BRAND_LINE_CONFIG.find(item =>
    item.kind === 'brand' && Array.from(item.brands || []).some(value => cleanText(value).toLowerCase() === normal)
  );
}

export function discoverBrandLineFilters(root = document, state = catalogueStateByRoot.get(root)) {
  const cards = activeCardsForRoot(root, state);
  const output = [];
  const seen = new Set();

  for (const configured of BRAND_LINE_CONFIG) {
    if (configured.kind !== 'brand') continue;
    if (!cards.some(card => descriptorMatchesCard(card, configured))) continue;
    output.push({ ...configured });
    seen.add(configured.id);
  }

  const brands = Array.from(new Set(cards.map(cardBrand).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  for (const label of brands) {
    const configured = configuredBrandForLabel(label);
    const id = configured?.id || slugify(label);
    if (!id || seen.has(id)) continue;
    output.push(configured ? { ...configured } : { id, label, kind:'brand', brands:[label] });
    seen.add(id);
  }
  return output;
}

export function brandLogoUrl(id) {
  const safe = slugify(id);
  return safe ? `${IMAGE_API}brand-logo-${safe}` : '';
}

export function brandLogoSrc(id, version = Date.now()) {
  const url = brandLogoUrl(id);
  return url ? `${url}?v=${encodeURIComponent(String(version))}` : '';
}

export function normaliseBrandLogoSettings(value = {}) {
  return {
    size: clamp(value?.size, 12, 96, DEFAULT_LOGO_SETTINGS.size),
    x: clamp(value?.x, -40, 40, DEFAULT_LOGO_SETTINGS.x),
    y: clamp(value?.y, -40, 40, DEFAULT_LOGO_SETTINGS.y)
  };
}

export function applyBrandLogoSettings(image, value = DEFAULT_LOGO_SETTINGS) {
  if (!image?.style) return;
  const settings = normaliseBrandLogoSettings(value);
  image.style.width = `${settings.size}px`;
  image.style.height = `${settings.size}px`;
  image.style.flexBasis = `${settings.size}px`;
  image.style.transform = `translate(${settings.x}px, ${settings.y}px)`;
}

function brandLogoSettingsFromState(state, id) {
  return normaliseBrandLogoSettings(state?.sections?.brandLogos?.[id]);
}

function readAdminToken(view = globalThis) {
  if (adminTokenMemory) return adminTokenMemory;
  try { adminTokenMemory = view?.sessionStorage?.getItem(ADMIN_TOKEN_SESSION_KEY) || ''; }
  catch (_) { adminTokenMemory = ''; }
  return adminTokenMemory;
}

function storeAdminToken(token, view = globalThis) {
  adminTokenMemory = String(token || '').trim();
  try {
    if (adminTokenMemory) view?.sessionStorage?.setItem(ADMIN_TOKEN_SESSION_KEY, adminTokenMemory);
    else view?.sessionStorage?.removeItem(ADMIN_TOKEN_SESSION_KEY);
  } catch (_) {}
}

function requireAdminToken(view = globalThis) {
  const existing = readAdminToken(view);
  if (existing) return existing;
  const entered = view?.prompt?.('Admin token required to change the catalogue.') || '';
  const token = entered.trim();
  if (!token) throw new Error('Admin token is required to change a brand logo.');
  storeAdminToken(token, view);
  return token;
}

async function authenticatedWriteFetch(url, options = {}, view = globalThis) {
  const token = requireAdminToken(view);
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  const writer = view?.fetch?.bind(view) || globalThis.fetch?.bind(globalThis);
  if (!writer) throw new Error('Catalogue editing is unavailable in this browser.');
  const response = await writer(url, { ...options, headers });
  if (response.status === 401) storeAdminToken('', view);
  return response;
}

export async function uploadBrandLogo(id, file, writeFetch = null, view = globalThis) {
  if (!file) throw new Error('Choose a PNG, JPEG or WebP logo.');
  if (!ALLOWED_LOGO_TYPES.has(file.type)) throw new Error('Logo must be PNG, JPEG or WebP.');
  if (file.size > MAX_LOGO_BYTES) throw new Error('Logo exceeds the 12 MiB upload limit.');
  const url = brandLogoUrl(id);
  if (!url) throw new Error('Invalid brand logo key.');
  const writer = writeFetch || ((target, options) => authenticatedWriteFetch(target, options, view));
  const response = await writer(url, { method:'PUT', headers:{ 'content-type':file.type }, body:file });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Logo upload failed with HTTP ${response.status}`);
  return payload;
}

export async function saveBrandLogoSettings(id, value, state = {}, writeFetch = null, view = globalThis) {
  const safe = slugify(id);
  if (!safe) throw new Error('Invalid brand logo key.');
  const settings = normaliseBrandLogoSettings(value);
  const sections = {
    ...(state?.sections || {}),
    brandLogos: {
      ...(state?.sections?.brandLogos || {}),
      [safe]: settings
    }
  };
  const writer = writeFetch || ((target, options) => authenticatedWriteFetch(target, options, view));
  const response = await writer(STATE_API, {
    method:'PUT',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ sections })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Logo settings save failed with HTTP ${response.status}`);
  return payload;
}

export function createBrandLineButton(root, descriptor, state = null) {
  const button = root.createElement('button');
  button.type = 'button';
  button.className = 'catalogue-sidebar-choice';
  button.dataset.brandLineFilter = descriptor.id;
  button.setAttribute('aria-pressed', 'false');

  if (descriptor.id !== 'all') {
    const image = root.createElement('img');
    image.className = 'catalogue-brand-line-logo';
    image.alt = '';
    image.loading = 'lazy';
    image.hidden = true;
    applyBrandLogoSettings(image, brandLogoSettingsFromState(state, descriptor.id));
    image.addEventListener('load', () => { image.hidden = false; });
    image.addEventListener('error', () => { image.hidden = true; });
    image.src = brandLogoSrc(descriptor.id);
    button.appendChild(image);
  }

  const label = root.createElement('span');
  label.className = 'catalogue-brand-label';
  label.textContent = descriptor.label;
  button.appendChild(label);
  return button;
}

function updateLocalLogoState(root, id, settings) {
  const current = catalogueStateByRoot.get(root) || {};
  const next = {
    ...current,
    sections: {
      ...(current.sections || {}),
      brandLogos: {
        ...(current.sections?.brandLogos || {}),
        [id]: normaliseBrandLogoSettings(settings)
      }
    }
  };
  catalogueStateByRoot.set(root, next);
  return next;
}

function createRangeControl(root, labelText, id, dataName, min, max, value) {
  const label = root.createElement('label');
  label.className = 'catalogue-brand-logo-control';
  const caption = root.createElement('span');
  caption.textContent = labelText;
  const input = root.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.dataset[dataName] = id;
  label.append(caption, input);
  return { label, input };
}

function createBrandRow(root, descriptor, view, state = catalogueStateByRoot.get(root)) {
  const row = root.createElement('div');
  row.className = 'catalogue-brand-row';
  const filterButton = createBrandLineButton(root, descriptor, state);
  row.appendChild(filterButton);

  const actions = root.createElement('div');
  actions.className = 'catalogue-brand-logo-actions';

  const uploadButton = root.createElement('button');
  uploadButton.type = 'button';
  uploadButton.className = 'catalogue-brand-logo-upload';
  uploadButton.dataset.brandLogoUpload = descriptor.id;
  uploadButton.textContent = 'Upload logo';

  const adjustButton = root.createElement('button');
  adjustButton.type = 'button';
  adjustButton.className = 'catalogue-brand-logo-adjust';
  adjustButton.dataset.brandLogoAdjust = descriptor.id;
  adjustButton.textContent = 'Adjust';

  const input = root.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.hidden = true;
  input.dataset.brandLogoInput = descriptor.id;

  const panel = root.createElement('div');
  panel.className = 'catalogue-brand-logo-controls';
  panel.dataset.brandLogoControls = descriptor.id;
  panel.hidden = true;
  const settings = brandLogoSettingsFromState(state, descriptor.id);
  const sizeControl = createRangeControl(root, 'Size', descriptor.id, 'brandLogoSize', 12, 96, settings.size);
  const xControl = createRangeControl(root, 'X', descriptor.id, 'brandLogoX', -40, 40, settings.x);
  const yControl = createRangeControl(root, 'Y', descriptor.id, 'brandLogoY', -40, 40, settings.y);
  const resetButton = root.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'catalogue-brand-logo-reset';
  resetButton.dataset.brandLogoReset = descriptor.id;
  resetButton.textContent = 'Reset';
  panel.append(sizeControl.label, xControl.label, yControl.label, resetButton);

  const image = filterButton.querySelector('.catalogue-brand-line-logo');
  image?.addEventListener('load', () => { uploadButton.textContent = 'Replace logo'; });

  uploadButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    input.click();
  });

  adjustButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    panel.hidden = !panel.hidden;
  });

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    uploadButton.disabled = true;
    uploadButton.textContent = 'Uploading…';
    let previewUrl = '';
    try {
      previewUrl = view?.URL?.createObjectURL?.(file) || '';
      if (image && previewUrl) {
        image.hidden = false;
        image.src = previewUrl;
      }
      await uploadBrandLogo(descriptor.id, file, null, view);
      if (image && !previewUrl) {
        image.hidden = true;
        image.src = brandLogoSrc(descriptor.id);
      }
      uploadButton.textContent = 'Replace logo';
    } catch (error) {
      uploadButton.textContent = 'Upload logo';
      if (image) image.src = brandLogoSrc(descriptor.id);
      view?.alert?.(error?.message || 'Brand logo upload failed.');
    } finally {
      uploadButton.disabled = false;
      input.value = '';
    }
  });

  const currentSettings = () => normaliseBrandLogoSettings({
    size:sizeControl.input.value,
    x:xControl.input.value,
    y:yControl.input.value
  });

  const applyLive = () => applyBrandLogoSettings(image, currentSettings());
  const persist = async () => {
    const nextSettings = currentSettings();
    const currentState = catalogueStateByRoot.get(root) || state || {};
    try {
      const payload = await saveBrandLogoSettings(descriptor.id, nextSettings, currentState, null, view);
      if (payload && typeof payload === 'object' && payload.sections) catalogueStateByRoot.set(root, payload);
      else updateLocalLogoState(root, descriptor.id, nextSettings);
    } catch (error) {
      view?.alert?.(error?.message || 'Logo adjustment could not be saved.');
    }
  };

  for (const control of [sizeControl.input, xControl.input, yControl.input]) {
    control.addEventListener('input', applyLive);
    control.addEventListener('change', persist);
  }

  resetButton.addEventListener('click', async event => {
    event.preventDefault();
    sizeControl.input.value = String(DEFAULT_LOGO_SETTINGS.size);
    xControl.input.value = '0';
    yControl.input.value = '0';
    applyLive();
    await persist();
  });

  actions.append(uploadButton, adjustButton);
  row.append(actions, input, panel);
  return row;
}

function removeEmptyStates(root) {
  root.querySelectorAll?.('.catalogue-brand-line-empty').forEach(node => node.remove());
}

function updateSubsectionEmptyStates(root, descriptor, state = catalogueStateByRoot.get(root)) {
  removeEmptyStates(root);
  if (!descriptor || descriptor.id === 'all') return;
  for (const block of Array.from(root.querySelectorAll?.('#cards [data-recommendation-subsection]') || [])) {
    const cards = Array.from(block.querySelectorAll?.('article.card[data-key]') || []).filter(card => !isArchived(card, state));
    if (cards.some(card => !card.classList.contains('brand-line-filter-hidden'))) continue;
    const note = root.createElement('p');
    note.className = 'catalogue-brand-line-empty';
    note.textContent = `No ${descriptor.label} matches in this subsection.`;
    block.appendChild(note);
  }
}

function updateBrandLineUrl(view, id) {
  if (!view?.location?.href || !view?.history?.replaceState) return;
  const url = new URL(view.location.href);
  if (!id || id === 'all') url.searchParams.delete(BRAND_LINE_QUERY_PARAM);
  else url.searchParams.set(BRAND_LINE_QUERY_PARAM, id);
  view.history.replaceState(view.history.state, '', url.toString());
}

export function applyBrandLineFilter(root = document, id = 'all', view = globalThis.window, state = catalogueStateByRoot.get(root)) {
  const descriptors = discoverBrandLineFilters(root, state);
  const descriptor = id === 'all' ? { id:'all', label:'All Brands' } : descriptors.find(item => item.id === id);
  const active = descriptor || { id:'all', label:'All Brands' };

  for (const card of allCardsForRoot(root)) {
    if (isArchived(card, state)) {
      card.classList.remove('brand-line-filter-hidden');
      continue;
    }
    card.classList.toggle('brand-line-filter-hidden', !descriptorMatchesCard(card, active));
  }
  root.querySelectorAll?.('[data-brand-line-filter]').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.brandLineFilter === active.id ? 'true' : 'false');
  });
  const extras = root.getElementById?.(EXTRA_ID);
  if (extras) extras.dataset.activeBrandLine = active.id;
  updateSubsectionEmptyStates(root, active, state);
  updateBrandLineUrl(view, active.id);
  return active.id;
}

function initialBrandLineId(root, view, state = catalogueStateByRoot.get(root)) {
  try {
    const requested = new URL(view?.location?.href || '').searchParams.get(BRAND_LINE_QUERY_PARAM) || 'all';
    if (requested === 'all') return 'all';
    return discoverBrandLineFilters(root, state).some(item => item.id === requested) ? requested : 'all';
  } catch (_) {
    return 'all';
  }
}

function renderBrandLineButtons(root, container, activeId, view, state = catalogueStateByRoot.get(root)) {
  const descriptors = discoverBrandLineFilters(root, state);
  container.replaceChildren();
  container.appendChild(createBrandLineButton(root, { id:'all', label:'All Brands' }, state));
  for (const descriptor of descriptors) container.appendChild(createBrandRow(root, descriptor, view, state));
  container.querySelectorAll('[data-brand-line-filter]').forEach(button => {
    button.addEventListener('click', () => applyBrandLineFilter(root, button.dataset.brandLineFilter, view, catalogueStateByRoot.get(root)));
  });
  applyBrandLineFilter(root, descriptors.some(item => item.id === activeId) || activeId === 'all' ? activeId : 'all', view, state);
}

function ensureExtraControls(root = document, view = globalThis.window) {
  let extra = root.getElementById?.(EXTRA_ID);
  if (extra) return extra;

  extra = root.createElement('div');
  extra.id = EXTRA_ID;
  extra.className = 'catalogue-sidebar-extra-controls';

  const navSection = root.createElement('section');
  navSection.className = 'catalogue-sidebar-section';
  const navTitle = root.createElement('div');
  navTitle.className = 'catalogue-sidebar-heading';
  navTitle.textContent = 'CATALOGUE';
  const navButtons = root.createElement('div');
  navButtons.className = 'catalogue-sidebar-list';
  for (const jump of CATALOGUE_JUMPS) {
    const button = root.createElement('button');
    button.type = 'button';
    button.className = 'catalogue-sidebar-choice';
    button.dataset.catalogueJump = jump.id;
    button.textContent = jump.label;
    button.addEventListener('click', () => {
      const target = root.querySelector?.(`[data-recommendation-subsection="${jump.id}"]`) || root.getElementById?.(`recommendation-${jump.id}`);
      target?.scrollIntoView?.({ behavior:'smooth', block:'start' });
    });
    navButtons.appendChild(button);
  }
  navSection.append(navTitle, navButtons);

  const brandSection = root.createElement('section');
  brandSection.className = 'catalogue-sidebar-section';
  const brandTitle = root.createElement('div');
  brandTitle.className = 'catalogue-sidebar-heading';
  brandTitle.textContent = 'BRANDS';
  const brandButtons = root.createElement('div');
  brandButtons.className = 'catalogue-sidebar-list';
  brandButtons.dataset.brandLineOptions = '';
  brandSection.append(brandTitle, brandButtons);
  extra.append(navSection, brandSection);

  const toolbar = root.getElementById?.('catalogue-convenience-toolbar');
  const controls = root.querySelector?.('.controls');
  const anchor = toolbar || controls;
  if (anchor?.parentNode) anchor.parentNode.insertBefore(extra, anchor);
  else (root.body || root.documentElement).appendChild(extra);

  renderBrandLineButtons(root, brandButtons, initialBrandLineId(root, view), view);
  return extra;
}

function controlNodes(root = document) {
  return [
    root.getElementById?.(EXTRA_ID),
    root.getElementById?.('catalogue-convenience-toolbar'),
    root.querySelector?.('.controls')
  ].filter(Boolean);
}

export function moveControlsToSidebar(root = document, view = globalThis.window) {
  ensureExtraControls(root, view);
  const sidebar = ensureSidebar(root);
  for (const node of controlNodes(root)) {
    rememberPlacement(node);
    sidebar.appendChild(node);
  }
  return sidebar;
}

export function restoreControlsFromSidebar(root = document) {
  for (const node of controlNodes(root)) restoreNode(node);
  const sidebar = root.getElementById?.(SIDEBAR_ID);
  if (sidebar && !sidebar.children.length) sidebar.remove();
}

function refreshBrandLineOptions(root, view, state = catalogueStateByRoot.get(root)) {
  const extra = root.getElementById?.(EXTRA_ID);
  const container = extra?.querySelector?.('[data-brand-line-options]');
  if (!container) return;
  const activeId = extra.dataset.activeBrandLine || initialBrandLineId(root, view, state);
  renderBrandLineButtons(root, container, activeId, view, state);
}

async function refreshCatalogueState(root, view) {
  const reader = view?.fetch?.bind(view);
  if (!reader) return;
  try {
    const response = await reader(STATE_API, { cache:'no-store', headers:{ accept:'application/json' } });
    if (!response?.ok) return;
    const state = await response.json();
    if (!state || typeof state !== 'object') return;
    catalogueStateByRoot.set(root, state);
    refreshBrandLineOptions(root, view, state);
  } catch (_) {}
}

function ensureStyles(root = document) {
  if (root.getElementById?.(STYLE_ID)) return;
  const style = root.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.brand-line-filter-hidden{display:none!important}
#cards [data-recommendation-subsection]{scroll-margin-top:24px}
#${EXTRA_ID}{display:flex;flex-direction:column;gap:10px;margin:0 0 14px}
#${EXTRA_ID} .catalogue-sidebar-section{padding:10px;border:1px solid rgba(195,162,80,.35);border-radius:10px;background:rgba(10,9,7,.94)}
#${EXTRA_ID} .catalogue-sidebar-heading{margin:0 0 8px;color:#d7bf7b;font-size:11px;font-weight:800;letter-spacing:.14em}
#${EXTRA_ID} .catalogue-sidebar-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:5px}
#${EXTRA_ID} .catalogue-brand-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;align-items:start}
#${EXTRA_ID} .catalogue-sidebar-choice{width:100%;min-height:34px;display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(255,255,255,.035);color:inherit;font:inherit;line-height:1.2;text-align:left;cursor:pointer;min-width:0;overflow:visible}
#${EXTRA_ID} .catalogue-sidebar-choice:hover{border-color:rgba(195,162,80,.62);background:rgba(195,162,80,.08)}
#${EXTRA_ID} .catalogue-sidebar-choice[aria-pressed="true"]{border-color:#c3a250;background:rgba(195,162,80,.16);color:#f5e7b8}
#${EXTRA_ID} .catalogue-brand-line-logo{width:24px;height:24px;object-fit:contain;object-position:center;flex:0 0 24px;position:relative;z-index:1}
#${EXTRA_ID} .catalogue-brand-label{position:relative;z-index:2}
#${EXTRA_ID} .catalogue-brand-logo-actions{display:flex;flex-direction:column;gap:4px}
#${EXTRA_ID} .catalogue-brand-logo-upload,#${EXTRA_ID} .catalogue-brand-logo-adjust,#${EXTRA_ID} .catalogue-brand-logo-reset{padding:5px 7px;border:1px solid rgba(195,162,80,.38);border-radius:7px;background:rgba(195,162,80,.07);color:#d7bf7b;font:700 10px/1.1 inherit;cursor:pointer;white-space:normal;max-width:74px}
#${EXTRA_ID} .catalogue-brand-logo-upload:hover,#${EXTRA_ID} .catalogue-brand-logo-adjust:hover,#${EXTRA_ID} .catalogue-brand-logo-reset:hover{border-color:#c3a250;background:rgba(195,162,80,.14)}
#${EXTRA_ID} .catalogue-brand-logo-upload:disabled{opacity:.55;cursor:wait}
#${EXTRA_ID} .catalogue-brand-logo-controls{grid-column:1/-1;padding:7px;border:1px solid rgba(255,255,255,.09);border-radius:7px;background:rgba(255,255,255,.025);display:grid;grid-template-columns:1fr;gap:5px}
#${EXTRA_ID} .catalogue-brand-logo-controls[hidden]{display:none!important}
#${EXTRA_ID} .catalogue-brand-logo-control{display:grid;grid-template-columns:38px 1fr;align-items:center;gap:6px;font-size:10px;color:rgba(255,255,255,.7)}
#${EXTRA_ID} .catalogue-brand-logo-control input{width:100%}
.catalogue-brand-line-empty{margin:10px 0 0;padding:9px 11px;border:1px dashed rgba(195,162,80,.28);border-radius:8px;color:rgba(255,255,255,.62);font-size:12px}
#${SIDEBAR_ID}{position:fixed;z-index:44;top:18px;right:calc(50vw + 650px);width:min(230px,calc(50vw - 660px));max-height:calc(100vh - 36px);overflow:auto;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin}
#${SIDEBAR_ID} #${EXTRA_ID}{margin:0}
#${SIDEBAR_ID} #${EXTRA_ID} .catalogue-sidebar-list{grid-template-columns:1fr}
#${SIDEBAR_ID} .catalogue-convenience-toolbar{position:static!important;top:auto!important;width:100%!important;margin:0!important;padding:9px!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:8px!important}
#${SIDEBAR_ID} .catalogue-convenience-toolbar .convenience-toolbar-group{width:100%!important;display:flex!important;align-items:center!important;gap:5px!important;flex-wrap:wrap!important}
#${SIDEBAR_ID} .controls{width:100%!important;margin:0!important;padding:10px!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:10px!important;border:1px solid rgba(195,162,80,.35);border-radius:10px;background:rgba(10,9,7,.94)}
#${SIDEBAR_ID} .sort-pair{width:100%!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:8px!important}
#${SIDEBAR_ID} .controls label{display:block!important;width:100%!important}
#${SIDEBAR_ID} .controls select{display:block!important;width:100%!important;min-width:0!important;margin:4px 0 0!important;padding:7px 26px 7px 8px!important;font-size:12px!important}
#${SIDEBAR_ID} .toggle{width:100%!important;display:grid!important;grid-template-columns:1fr!important;gap:5px!important}
#${SIDEBAR_ID} .toggle button{width:100%!important;padding:7px 8px!important;text-align:left!important;line-height:1.25!important}
@media(max-width:1659px){#${SIDEBAR_ID}{display:none!important}}
`;
  (root.head || root.documentElement).appendChild(style);
}

export function installControlSidebar(root = document, view = globalThis.window) {
  if (!root?.querySelector) return;
  ensureStyles(root);
  ensureExtraControls(root, view);
  const media = view?.matchMedia?.(DESKTOP_QUERY);
  let retries = 0;

  const apply = () => {
    if (media?.matches) moveControlsToSidebar(root, view);
    else restoreControlsFromSidebar(root);

    if (media?.matches && !root.getElementById?.('catalogue-convenience-toolbar') && retries < 20) {
      retries += 1;
      view?.setTimeout?.(apply, 50);
    }
  };

  apply();
  media?.addEventListener?.('change', apply);
  view?.setTimeout?.(() => refreshBrandLineOptions(root, view), 0);
  refreshCatalogueState(root, view);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installControlSidebar(document, window), { once:true });
  } else {
    installControlSidebar(document, window);
  }
}

export { DESKTOP_QUERY, SIDEBAR_ID, EXTRA_ID };