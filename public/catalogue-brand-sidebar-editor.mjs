const STATE_API = '/api/catalogue-overrides';
const EXTRA_ID = 'catalogue-sidebar-extra-controls';
const STYLE_ID = 'catalogue-brand-sidebar-editor-style';
const ADMIN_TOKEN_SESSION_KEY = 'cigar-catalogue-admin-token';
const installedRoots = new WeakSet();
const stateByRoot = new WeakMap();
let adminTokenMemory = '';

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

export function normaliseHiddenBrandIds(value) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(source.map(slugify).filter(Boolean)));
}

function hiddenBrandIdsFromState(state) {
  return normaliseHiddenBrandIds(state?.sections?.hiddenBrands);
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
  if (!token) throw new Error('Admin token is required to change brand visibility.');
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

export async function saveHiddenBrandIds(ids, state = {}, writeFetch = null, view = globalThis) {
  const hiddenBrands = normaliseHiddenBrandIds(ids);
  const sections = {
    ...(state?.sections || {}),
    hiddenBrands
  };
  const writer = writeFetch || ((target, options) => authenticatedWriteFetch(target, options, view));
  const response = await writer(STATE_API, {
    method:'PUT',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ sections })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Brand visibility save failed with HTTP ${response.status}`);
  return payload;
}

function ensureStyles(root = document) {
  if (root.getElementById?.(STYLE_ID)) return;
  const style = root.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
body:not(.catalogue-direct-edit-mode) #${EXTRA_ID} .catalogue-brand-logo-actions{display:none!important}
body:not(.catalogue-direct-edit-mode) #${EXTRA_ID} .catalogue-brand-logo-controls{display:none!important}
body:not(.catalogue-direct-edit-mode) #${EXTRA_ID} .catalogue-brand-removed-panel{display:none!important}
#${EXTRA_ID} .catalogue-brand-section [data-brand-line-options][hidden]{display:none!important}
#${EXTRA_ID} .catalogue-brand-section .catalogue-brand-row[hidden]{display:none!important}
#${EXTRA_ID} .catalogue-brand-section .catalogue-brand-removed-panel[hidden]{display:none!important}
#${EXTRA_ID} .catalogue-brand-dropdown-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;cursor:pointer;user-select:none;margin-bottom:0!important}
#${EXTRA_ID} .catalogue-brand-dropdown-heading::after{content:'▾';font-size:11px;line-height:1;transition:transform .15s ease}
#${EXTRA_ID} .catalogue-brand-dropdown-heading[aria-expanded="true"]::after{transform:rotate(180deg)}
#${EXTRA_ID} .catalogue-brand-section [data-brand-line-options]{padding-top:7px}
#${EXTRA_ID} .catalogue-brand-section .catalogue-brand-row{gap:3px}
#${EXTRA_ID} .catalogue-brand-section .catalogue-sidebar-choice{border:0!important;box-shadow:none!important;background:transparent!important;border-radius:0!important;min-height:30px;padding:5px 3px}
#${EXTRA_ID} .catalogue-brand-section .catalogue-sidebar-choice:hover{border:0!important;background:rgba(195,162,80,.07)!important}
#${EXTRA_ID} .catalogue-brand-section .catalogue-sidebar-choice[aria-pressed="true"]{border:0!important;background:transparent!important;color:#f5e7b8}
#${EXTRA_ID} .catalogue-brand-remove{padding:5px 7px;border:1px solid rgba(196,89,72,.45);border-radius:7px;background:rgba(196,89,72,.08);color:#e6a497;font:700 10px/1.1 inherit;cursor:pointer;white-space:normal;max-width:74px}
#${EXTRA_ID} .catalogue-brand-remove:hover{border-color:rgba(220,110,92,.8);background:rgba(196,89,72,.15)}
#${EXTRA_ID} .catalogue-brand-removed-panel{grid-column:1/-1;margin-top:4px;padding:7px;border:1px dashed rgba(195,162,80,.3);border-radius:7px;background:rgba(255,255,255,.02)}
#${EXTRA_ID} .catalogue-brand-removed-title{margin:0 0 5px;color:rgba(255,255,255,.62);font:700 10px/1.2 inherit;text-transform:uppercase;letter-spacing:.08em}
#${EXTRA_ID} .catalogue-brand-restore-list{display:flex;flex-wrap:wrap;gap:4px}
#${EXTRA_ID} .catalogue-brand-restore{padding:5px 7px;border:1px solid rgba(195,162,80,.38);border-radius:7px;background:rgba(195,162,80,.07);color:#d7bf7b;font:700 10px/1.1 inherit;cursor:pointer}
`;
  (root.head || root.documentElement).appendChild(style);
}

function brandSection(root) {
  const extra = root.getElementById?.(EXTRA_ID);
  if (!extra) return null;
  return Array.from(extra.querySelectorAll?.('.catalogue-sidebar-section') || [])
    .find(section => cleanText(section.querySelector?.('.catalogue-sidebar-heading')?.textContent).toUpperCase() === 'BRANDS') || null;
}

function brandList(section) {
  return section?.querySelector?.('[data-brand-line-options]') || null;
}

function makeBrandDropdown(section) {
  const heading = section?.querySelector?.('.catalogue-sidebar-heading');
  const list = brandList(section);
  if (!heading || !list) return null;
  section.classList.add('catalogue-brand-section');
  if (heading.dataset.brandDropdownReady === '1') return { heading, list };

  heading.dataset.brandDropdownReady = '1';
  heading.dataset.brandDropdownToggle = '';
  heading.classList.add('catalogue-brand-dropdown-heading');
  heading.setAttribute('role', 'button');
  heading.setAttribute('tabindex', '0');
  heading.setAttribute('aria-expanded', 'false');
  list.hidden = true;

  const toggle = () => {
    const opening = list.hidden;
    list.hidden = !opening;
    heading.setAttribute('aria-expanded', opening ? 'true' : 'false');
  };
  heading.addEventListener('click', toggle);
  heading.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle();
  });
  return { heading, list };
}

function rowId(row) {
  return slugify(row?.querySelector?.('[data-brand-line-filter]')?.dataset?.brandLineFilter);
}

function rowLabel(row, id) {
  return cleanText(row?.querySelector?.('.catalogue-brand-label')?.textContent) ||
    cleanText(row?.querySelector?.('[data-brand-line-filter]')?.textContent) || id;
}

function currentState(root) {
  return stateByRoot.get(root) || { sections:{} };
}

function withHiddenBrands(state, ids) {
  return {
    ...(state || {}),
    sections: {
      ...(state?.sections || {}),
      hiddenBrands:normaliseHiddenBrandIds(ids)
    }
  };
}

async function persistHiddenBrands(root, ids, view) {
  const before = currentState(root);
  const normalised = normaliseHiddenBrandIds(ids);
  const payload = await saveHiddenBrandIds(normalised, before, null, view);
  const next = payload && typeof payload === 'object' && payload.sections
    ? payload
    : withHiddenBrands(before, normalised);
  stateByRoot.set(root, next);
  return next;
}

function ensureRemoveButton(root, row, id, view) {
  const actions = row.querySelector?.('.catalogue-brand-logo-actions');
  if (!actions || !id) return;
  const adjust = actions.querySelector?.(`[data-brand-logo-adjust="${id}"]`);
  if (adjust) adjust.textContent = 'Adjust logo';
  if (actions.querySelector?.(`[data-brand-remove="${id}"]`)) return;

  const remove = root.createElement('button');
  remove.type = 'button';
  remove.className = 'catalogue-brand-remove';
  remove.dataset.brandRemove = id;
  remove.textContent = 'Remove';
  remove.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    if (!root.body?.classList.contains('catalogue-direct-edit-mode')) return;
    const label = rowLabel(row, id);
    if (view?.confirm && !view.confirm(`Remove ${label} from the Brands filter? This does not delete its cigars.`)) return;
    const ids = new Set(hiddenBrandIdsFromState(currentState(root)));
    ids.add(id);
    try {
      const next = await persistHiddenBrands(root, Array.from(ids), view);
      applyState(root, next, view);
    } catch (error) {
      view?.alert?.(error?.message || 'Brand could not be removed from the filter.');
    }
  });
  actions.appendChild(remove);
}

function ensureRemovedPanel(root, list, view, state) {
  let panel = list.querySelector?.(':scope > .catalogue-brand-removed-panel');
  if (!panel) {
    panel = root.createElement('div');
    panel.className = 'catalogue-brand-removed-panel';
    panel.dataset.brandRemovedPanel = '';
    const title = root.createElement('div');
    title.className = 'catalogue-brand-removed-title';
    title.textContent = 'Removed brands';
    const buttons = root.createElement('div');
    buttons.className = 'catalogue-brand-restore-list';
    panel.append(title, buttons);
    list.appendChild(panel);
  }

  const hidden = hiddenBrandIdsFromState(state);
  const buttons = panel.querySelector('.catalogue-brand-restore-list');
  buttons.replaceChildren();
  panel.hidden = hidden.length === 0;
  for (const id of hidden) {
    const row = Array.from(list.querySelectorAll(':scope > .catalogue-brand-row')).find(item => rowId(item) === id);
    const label = rowLabel(row, id);
    const button = root.createElement('button');
    button.type = 'button';
    button.className = 'catalogue-brand-restore';
    button.dataset.brandRestore = id;
    button.textContent = `Restore ${label}`;
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!root.body?.classList.contains('catalogue-direct-edit-mode')) return;
      const ids = hiddenBrandIdsFromState(currentState(root)).filter(value => value !== id);
      try {
        const next = await persistHiddenBrands(root, ids, view);
        applyState(root, next, view);
      } catch (error) {
        view?.alert?.(error?.message || 'Brand could not be restored.');
      }
    });
    buttons.appendChild(button);
  }
}

function applyState(root, state, view) {
  const section = brandSection(root);
  const dropdown = makeBrandDropdown(section);
  const list = dropdown?.list;
  if (!list) return;
  const hidden = new Set(hiddenBrandIdsFromState(state));
  for (const row of Array.from(list.querySelectorAll(':scope > .catalogue-brand-row'))) {
    const id = rowId(row);
    if (!id) continue;
    ensureRemoveButton(root, row, id, view);
    row.hidden = hidden.has(id);
  }

  const active = list.querySelector('[data-brand-line-filter][aria-pressed="true"]');
  if (active && hidden.has(slugify(active.dataset.brandLineFilter))) {
    list.querySelector('[data-brand-line-filter="all"]')?.click();
  }
  ensureRemovedPanel(root, list, view, state);
}

async function fetchState(view) {
  const reader = view?.fetch?.bind(view);
  if (!reader) return { sections:{} };
  const response = await reader(STATE_API, { cache:'no-store', headers:{ accept:'application/json' } });
  if (!response?.ok) throw new Error(`Could not load catalogue state (${response?.status || 'unknown'})`);
  const state = await response.json();
  return state && typeof state === 'object' ? state : { sections:{} };
}

function observeBrandRows(root, list, view) {
  const Observer = view?.MutationObserver;
  if (!Observer || list.dataset.brandEditorObserved === '1') return;
  list.dataset.brandEditorObserved = '1';
  const observer = new Observer(() => applyState(root, currentState(root), view));
  observer.observe(list, { childList:true, subtree:false });
}

async function initialiseWhenReady(root, view, attempt = 0) {
  const section = brandSection(root);
  const dropdown = makeBrandDropdown(section);
  if (!dropdown?.list) {
    if (attempt < 40) view?.setTimeout?.(() => initialiseWhenReady(root, view, attempt + 1), 50);
    return;
  }

  applyState(root, currentState(root), view);
  observeBrandRows(root, dropdown.list, view);
  try {
    const state = await fetchState(view);
    stateByRoot.set(root, state);
    applyState(root, state, view);
  } catch (_) {}
}

export function installBrandSidebarEditor(root = document, view = globalThis.window) {
  if (!root?.querySelector || installedRoots.has(root)) return;
  installedRoots.add(root);
  ensureStyles(root);
  initialiseWhenReady(root, view);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installBrandSidebarEditor(document, window), { once:true });
  } else {
    installBrandSidebarEditor(document, window);
  }
}
