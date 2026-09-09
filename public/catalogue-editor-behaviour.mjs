const MAIN_TYPE = 'main';
const HALF_TYPE = 'half';
const TASTER_TYPE = 'taster';
const TYPE_SELECT_ID = 'catalogue-v139-type';
const CARD_SELECT_ID = 'catalogue-admin-card';
const ADMIN_MODAL_ID = 'catalogue-admin';
const EDIT_TOGGLE_ID = 'catalogue-admin-toggle';
const RELOAD_ID = 'catalogue-admin-reload';

export const GLOBAL_SECTION_EDITORS = Object.freeze([
  Object.freeze({ id: 'catalogue-admin-legend', label: 'Legend & scoring guide' }),
  Object.freeze({ id: 'catalogue-admin-benchmarks', label: 'Benchmarks' })
]);

export function normaliseCatalogueType(value, legacyTaster = false) {
  const type = String(value || '').trim().toLowerCase();
  if (type === HALF_TYPE || type === 'half-cigar' || type === 'halfcigar') return HALF_TYPE;
  if (type === TASTER_TYPE || legacyTaster) return TASTER_TYPE;
  return MAIN_TYPE;
}

export function resolveCardCatalogueType(card) {
  if (!card) return MAIN_TYPE;
  const explicit = String(card.dataset?.catalogueType || '').trim();
  if (explicit) return normaliseCatalogueType(explicit, card.dataset?.taster === '1');
  if (card.dataset?.taster === '1') return TASTER_TYPE;
  if (card.closest?.('#half-cigar-cards')) return HALF_TYPE;
  return MAIN_TYPE;
}

export function preferredProgrammaticCatalogueType(requested, selectedType, explicitValue = '') {
  const requestedType = normaliseCatalogueType(requested);
  const selected = normaliseCatalogueType(selectedType);
  if (String(explicitValue || '').trim()) return requestedType;
  if (requestedType === MAIN_TYPE && selected === HALF_TYPE) return HALF_TYPE;
  return requestedType;
}

export function resetAdminEditorScroll(modal) {
  const panel = modal?.querySelector?.('.catalogue-admin-panel');
  if (panel) panel.scrollTop = 0;
  return panel || null;
}

export function closePublicDiagnostics(root = document) {
  const sections = root?.querySelectorAll?.('.legend-dropdown, #test-impact-map') || [];
  sections.forEach(section => {
    section.open = false;
    section.removeAttribute?.('open');
  });
  return sections.length;
}

function documentFor(root) {
  if (root?.createElement) return root;
  if (root?.ownerDocument?.createElement) return root.ownerDocument;
  return typeof document !== 'undefined' ? document : null;
}

function globalEditorDetailsFor(textarea) {
  return textarea?.closest?.('details.catalogue-admin-global-section') || null;
}

export function configureGlobalSectionEditors(root = document) {
  const doc = documentFor(root);
  if (!doc) return 0;
  let configured = 0;
  for (const item of GLOBAL_SECTION_EDITORS) {
    const textarea = root.getElementById?.(item.id) || root.querySelector?.(`#${item.id}`);
    if (!textarea) continue;
    if (globalEditorDetailsFor(textarea)) continue;
    const field = textarea.closest?.('.catalogue-admin-field');
    const parent = field?.parentNode;
    if (!field || !parent) continue;

    const details = doc.createElement('details');
    details.className = 'catalogue-admin-global-section';
    details.style.gridColumn = '1 / -1';
    const summary = doc.createElement('summary');
    summary.textContent = item.label;
    summary.style.cursor = 'pointer';
    summary.style.fontWeight = '700';
    summary.style.padding = '8px 0';
    parent.insertBefore(details, field);
    details.appendChild(summary);
    details.appendChild(field);
    configured += 1;
  }
  return configured;
}

export function closeGlobalSectionEditors(root = document) {
  const details = root?.querySelectorAll?.('details.catalogue-admin-global-section') || [];
  details.forEach(section => {
    section.open = false;
    section.removeAttribute?.('open');
  });
  return details.length;
}

function selectedAdminCard(root) {
  const key = root.getElementById?.(CARD_SELECT_ID)?.value || '';
  if (!key || key.startsWith('__')) return null;
  try {
    const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&');
    return root.querySelector?.(`article.card[data-key="${escaped}"]`) || null;
  } catch (_) {
    return Array.from(root.querySelectorAll?.('article.card[data-key]') || [])
      .find(card => card.dataset?.key === key) || null;
  }
}

function ensureHalfOption(root, select) {
  if (!select || Array.from(select.options || []).some(option => option.value === HALF_TYPE)) return;
  const doc = documentFor(root);
  if (!doc) return;
  const option = doc.createElement('option');
  option.value = HALF_TYPE;
  option.textContent = 'Half-Cigar';
  const taster = Array.from(select.options || []).find(item => item.value === TASTER_TYPE);
  if (taster) select.insertBefore(option, taster);
  else select.appendChild(option);
}

function selectValueDescriptor(select) {
  let prototype = Object.getPrototypeOf(select);
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.get && descriptor?.set) return descriptor;
    prototype = Object.getPrototypeOf(prototype);
  }
  return null;
}

export function installCatalogueTypeGuard(root = document) {
  const select = root.getElementById?.(TYPE_SELECT_ID) || root.querySelector?.(`#${TYPE_SELECT_ID}`);
  if (!select) return false;
  ensureHalfOption(root, select);
  if (select.dataset?.catalogueTypeGuard === '1') return true;

  const descriptor = selectValueDescriptor(select);
  if (!descriptor) return false;
  Object.defineProperty(select, 'value', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get() { return descriptor.get.call(this); },
    set(value) {
      const card = selectedAdminCard(root);
      const selectedType = resolveCardCatalogueType(card);
      const explicit = this.dataset?.catalogueTypeExplicit || '';
      descriptor.set.call(this, preferredProgrammaticCatalogueType(value, selectedType, explicit));
    }
  });
  select.dataset.catalogueTypeGuard = '1';

  select.addEventListener?.('change', () => {
    select.dataset.catalogueTypeExplicit = normaliseCatalogueType(descriptor.get.call(select));
  });
  root.getElementById?.(CARD_SELECT_ID)?.addEventListener?.('change', () => {
    delete select.dataset.catalogueTypeExplicit;
  });
  root.getElementById?.(RELOAD_ID)?.addEventListener?.('click', () => {
    delete select.dataset.catalogueTypeExplicit;
  });
  root.addEventListener?.('catalogue:cards-refreshed', () => {
    const card = selectedAdminCard(root);
    if (!card) return;
    const current = normaliseCatalogueType(descriptor.get.call(select));
    const resolved = resolveCardCatalogueType(card);
    if (current === resolved) delete select.dataset.catalogueTypeExplicit;
  });
  return true;
}

function prepareOpenEditor(root, modal) {
  configureGlobalSectionEditors(root);
  closeGlobalSectionEditors(root);
  resetAdminEditorScroll(modal);
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => resetAdminEditorScroll(modal));
  }
}

function installModalObserver(root) {
  const modal = root.getElementById?.(ADMIN_MODAL_ID);
  if (!modal || modal.dataset?.catalogueEditorBehaviourObserved === '1') return false;
  modal.dataset.catalogueEditorBehaviourObserved = '1';
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (!modal.hidden) prepareOpenEditor(root, modal);
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  }
  return true;
}

function installEditClickHooks(root) {
  if (root.documentElement?.dataset?.catalogueEditorBehaviourClicks === '1') return;
  if (root.documentElement?.dataset) root.documentElement.dataset.catalogueEditorBehaviourClicks = '1';
  root.addEventListener?.('click', event => {
    const toggle = event.target?.closest?.(`#${EDIT_TOGGLE_ID}`);
    if (!toggle) return;
    closePublicDiagnostics(root);
    const modal = root.getElementById?.(ADMIN_MODAL_ID);
    setTimeout(() => {
      installCatalogueTypeGuard(root);
      configureGlobalSectionEditors(root);
      if (modal && !modal.hidden) prepareOpenEditor(root, modal);
    }, 0);
  }, true);
}

export function initCatalogueEditorBehaviour(root = document) {
  if (!root) return;
  installCatalogueTypeGuard(root);
  configureGlobalSectionEditors(root);
  closeGlobalSectionEditors(root);
  installModalObserver(root);
  installEditClickHooks(root);

  let attempts = 0;
  const retry = () => {
    attempts += 1;
    const guarded = installCatalogueTypeGuard(root);
    configureGlobalSectionEditors(root);
    installModalObserver(root);
    if (!guarded && attempts < 40) setTimeout(retry, 50);
  };
  if (!(root.getElementById?.(TYPE_SELECT_ID))) setTimeout(retry, 0);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initCatalogueEditorBehaviour(document), { once: true });
  else initCatalogueEditorBehaviour(document);
}
