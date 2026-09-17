import { BRAND_LINE_CONFIG } from './catalogue-brand-line-config.mjs';

const STYLE_ID = 'catalogue-control-sidebar-style-v4';
const SIDEBAR_ID = 'catalogue-control-sidebar';
const EXTRA_ID = 'catalogue-sidebar-extra-controls';
const DESKTOP_QUERY = '(min-width: 1660px)';
const BRAND_LINE_QUERY_PARAM = 'brandLine';
const placements = new WeakMap();

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

function cardBrand(card) {
  return cleanText(
    card?.dataset?.brand ||
    card?.querySelector?.('h3 > span, h3 > small')?.textContent ||
    ''
  );
}

function isArchived(card) {
  return card?.dataset?.archived === '1';
}

function allCardsForRoot(root) {
  return Array.from(root.querySelectorAll?.('article.card[data-key]') || []);
}

function activeCardsForRoot(root) {
  return allCardsForRoot(root).filter(card => !isArchived(card));
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

export function discoverBrandLineFilters(root = document) {
  const cards = activeCardsForRoot(root);
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
    output.push(configured ? { ...configured } : { id, label, kind:'brand', logo:'', brands:[label] });
    seen.add(id);
  }
  return output;
}

export function createBrandLineButton(root, descriptor) {
  const button = root.createElement('button');
  button.type = 'button';
  button.className = 'catalogue-sidebar-choice';
  button.dataset.brandLineFilter = descriptor.id;
  button.setAttribute('aria-pressed', 'false');
  if (descriptor.logo) {
    const image = root.createElement('img');
    image.className = 'catalogue-brand-line-logo';
    image.src = descriptor.logo;
    image.alt = '';
    image.loading = 'lazy';
    button.appendChild(image);
  }
  const label = root.createElement('span');
  label.textContent = descriptor.label;
  button.appendChild(label);
  return button;
}

function removeEmptyStates(root) {
  root.querySelectorAll?.('.catalogue-brand-line-empty').forEach(node => node.remove());
}

function updateSubsectionEmptyStates(root, descriptor) {
  removeEmptyStates(root);
  if (!descriptor || descriptor.id === 'all') return;
  for (const block of Array.from(root.querySelectorAll?.('#cards [data-recommendation-subsection]') || [])) {
    const cards = Array.from(block.querySelectorAll?.('article.card[data-key]') || []).filter(card => !isArchived(card));
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

export function applyBrandLineFilter(root = document, id = 'all', view = globalThis.window) {
  const descriptors = discoverBrandLineFilters(root);
  const descriptor = id === 'all' ? { id:'all', label:'All Brands' } : descriptors.find(item => item.id === id);
  const active = descriptor || { id:'all', label:'All Brands' };

  for (const card of allCardsForRoot(root)) {
    if (isArchived(card)) {
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
  updateSubsectionEmptyStates(root, active);
  updateBrandLineUrl(view, active.id);
  return active.id;
}

function initialBrandLineId(root, view) {
  try {
    const requested = new URL(view?.location?.href || '').searchParams.get(BRAND_LINE_QUERY_PARAM) || 'all';
    if (requested === 'all') return 'all';
    return discoverBrandLineFilters(root).some(item => item.id === requested) ? requested : 'all';
  } catch (_) {
    return 'all';
  }
}

function renderBrandLineButtons(root, container, activeId, view) {
  const descriptors = discoverBrandLineFilters(root);
  container.replaceChildren();
  container.appendChild(createBrandLineButton(root, { id:'all', label:'All Brands', logo:'' }));
  for (const descriptor of descriptors) container.appendChild(createBrandLineButton(root, descriptor));
  container.querySelectorAll('[data-brand-line-filter]').forEach(button => {
    button.addEventListener('click', () => applyBrandLineFilter(root, button.dataset.brandLineFilter, view));
  });
  applyBrandLineFilter(root, descriptors.some(item => item.id === activeId) || activeId === 'all' ? activeId : 'all', view);
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

function refreshBrandLineOptions(root, view) {
  const extra = root.getElementById?.(EXTRA_ID);
  const container = extra?.querySelector?.('[data-brand-line-options]');
  if (!container) return;
  const activeId = extra.dataset.activeBrandLine || initialBrandLineId(root, view);
  renderBrandLineButtons(root, container, activeId, view);
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
#${EXTRA_ID} .catalogue-sidebar-choice{width:100%;min-height:34px;display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(255,255,255,.035);color:inherit;font:inherit;line-height:1.2;text-align:left;cursor:pointer}
#${EXTRA_ID} .catalogue-sidebar-choice:hover{border-color:rgba(195,162,80,.62);background:rgba(195,162,80,.08)}
#${EXTRA_ID} .catalogue-sidebar-choice[aria-pressed="true"]{border-color:#c3a250;background:rgba(195,162,80,.16);color:#f5e7b8}
#${EXTRA_ID} .catalogue-brand-line-logo{width:24px;height:24px;object-fit:contain;flex:0 0 24px}
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
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installControlSidebar(document, window), { once:true });
  } else {
    installControlSidebar(document, window);
  }
}

export { DESKTOP_QUERY, SIDEBAR_ID, EXTRA_ID };