const STYLE_ID = 'catalogue-control-sidebar-style-v3';
const SIDEBAR_ID = 'catalogue-control-sidebar';
const EXTRA_ID = 'catalogue-sidebar-extra-controls';
const DESKTOP_QUERY = '(min-width: 1660px)';
// How far left the sidebar and the cards sit, so neither hugs the right edge.
const RAIL_SHIFT = 24;
const BRAND_LINE_QUERY_PARAM = 'brandLine';
const placements = new WeakMap();

// Sidebar preferences are per-viewer chrome: which brand chips are hidden, what the
// catalogue jump buttons are called, and whether the brand list is expanded. They live
// in browser storage on purpose. Catalogue state is the product data and is never
// touched from here, so hiding a brand chip or renaming a jump button cannot alter,
// reorder or drop a single catalogue record.
export const SIDEBAR_PREFS_KEY = 'catalogue-sidebar-preferences-v1';

function storage(view = globalThis.window) {
  try {
    return view?.localStorage || null;
  } catch (_) {
    return null;
  }
}

export function readSidebarPreferences(view = globalThis.window) {
  const empty = { hiddenBrandLines: [], jumpLabels: {}, brandsExpanded: false };
  try {
    const raw = storage(view)?.getItem(SIDEBAR_PREFS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    return {
      hiddenBrandLines: Array.isArray(parsed.hiddenBrandLines)
        ? parsed.hiddenBrandLines.map(id => String(id || '').trim()).filter(Boolean)
        : [],
      jumpLabels: parsed.jumpLabels && typeof parsed.jumpLabels === 'object' ? { ...parsed.jumpLabels } : {},
      brandsExpanded: parsed.brandsExpanded === true
    };
  } catch (_) {
    return empty;
  }
}

export function writeSidebarPreferences(preferences, view = globalThis.window) {
  try {
    storage(view)?.setItem(SIDEBAR_PREFS_KEY, JSON.stringify(preferences));
  } catch (_) {}
  return preferences;
}

export function hideBrandLine(id, view = globalThis.window) {
  const clean = String(id || '').trim();
  const preferences = readSidebarPreferences(view);
  if (!clean || clean === 'all' || preferences.hiddenBrandLines.includes(clean)) return preferences;
  preferences.hiddenBrandLines = [...preferences.hiddenBrandLines, clean];
  return writeSidebarPreferences(preferences, view);
}

export function restoreHiddenBrandLines(view = globalThis.window) {
  const preferences = readSidebarPreferences(view);
  preferences.hiddenBrandLines = [];
  return writeSidebarPreferences(preferences, view);
}

export function setBrandsExpanded(expanded, view = globalThis.window) {
  const preferences = readSidebarPreferences(view);
  preferences.brandsExpanded = expanded === true;
  return writeSidebarPreferences(preferences, view);
}

export function renameCatalogueJump(id, label, view = globalThis.window) {
  const key = String(id || '').trim();
  const preferences = readSidebarPreferences(view);
  if (!key) return preferences;
  const clean = cleanText(label);
  if (clean) preferences.jumpLabels = { ...preferences.jumpLabels, [key]: clean };
  else {
    const next = { ...preferences.jumpLabels };
    delete next[key];
    preferences.jumpLabels = next;
  }
  return writeSidebarPreferences(preferences, view);
}

export function catalogueJumpLabel(jump, view = globalThis.window) {
  const custom = cleanText(readSidebarPreferences(view).jumpLabels?.[jump?.id]);
  return custom || jump?.label || '';
}

export const CATALOGUE_JUMPS = Object.freeze([
  Object.freeze({ id:'coronets-cigarillos', label:'Coronets & Cigarillos' }),
  Object.freeze({ id:'petit-panatelas', label:'Petit Panatelas, Petit Coronas & Petit Robustos' }),
  Object.freeze({ id:'flavoured-infused', label:'Flavoured & Infused Cigars' })
]);

// Optional logos live here so they can be added or replaced without touching render logic.
// Example: logo:'/assets/brand-logos/davidoff.webp'
export const BRAND_LINE_CONFIG = Object.freeze([
  Object.freeze({ id:'davidoff', label:'Davidoff', kind:'brand', logo:'', brands:['Davidoff'] }),
  Object.freeze({ id:'cao', label:'CAO', kind:'brand', logo:'', brands:['CAO'], keyPrefixes:['cao-'] }),
  Object.freeze({
    id:'drew-estate',
    label:'Drew Estate',
    kind:'brand',
    logo:'',
    brands:['Drew Estate', 'Java by Drew Estate'],
    keyPrefixes:['kfc-', 'java-', 'tabak-', 'acid-', 'isla-del-sol-', 'liga-', 'undercrown-', 'blackened-']
  }),
  Object.freeze({ id:'liga-privada', label:'Liga Privada', kind:'line', logo:'', brands:['Liga Privada'], keyPrefixes:['liga-'] }),
  Object.freeze({ id:'undercrown', label:'Undercrown', kind:'line', logo:'', brands:['Undercrown'], keyIncludes:['undercrown'] })
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
    card?.dataset?.brand
    || card?.querySelector?.('h3 span')?.textContent
    || card?.querySelector?.('h3 small')?.textContent
    || ''
  );
}

function cardKey(card) {
  return cleanText(card?.dataset?.key).toLowerCase();
}

function descriptorMatchesCard(card, descriptor) {
  if (!descriptor || descriptor.id === 'all') return true;
  const key = cardKey(card);
  const brand = cardBrand(card).toLowerCase();
  const brands = Array.from(descriptor.brands || []).map(value => cleanText(value).toLowerCase()).filter(Boolean);
  if (brands.includes(brand)) return true;
  if (Array.from(descriptor.keyPrefixes || []).some(prefix => key.startsWith(String(prefix).toLowerCase()))) return true;
  if (Array.from(descriptor.keyIncludes || []).some(fragment => key.includes(String(fragment).toLowerCase()))) return true;
  return false;
}

function cardsForRoot(root) {
  return Array.from(root.querySelectorAll?.('article.card[data-key]') || []);
}

export function discoverBrandLineFilters(root = document) {
  const cards = cardsForRoot(root);
  const output = [];
  const seen = new Set();

  for (const configured of BRAND_LINE_CONFIG) {
    if (!cards.some(card => descriptorMatchesCard(card, configured))) continue;
    output.push({ ...configured });
    seen.add(configured.id);
  }

  const brands = Array.from(new Set(cards.map(cardBrand).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  for (const label of brands) {
    const configured = BRAND_LINE_CONFIG.find(item => Array.from(item.brands || []).some(value => cleanText(value).toLowerCase() === label.toLowerCase()));
    const id = configured?.id || slugify(label);
    if (!id || seen.has(id)) continue;
    output.push({ id, label, kind:'brand', logo:'', brands:[label] });
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
    const cards = Array.from(block.querySelectorAll?.('article.card[data-key]') || []);
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
  const descriptor = id === 'all' ? { id:'all', label:'All Brands / Lines' } : descriptors.find(item => item.id === id);
  const active = descriptor || { id:'all', label:'All Brands / Lines' };

  for (const card of cardsForRoot(root)) {
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
  const hidden = new Set(readSidebarPreferences(view).hiddenBrandLines);
  const all = discoverBrandLineFilters(root);
  const descriptors = all.filter(descriptor => !hidden.has(descriptor.id));
  container.replaceChildren();
  container.appendChild(createBrandLineButton(root, { id:'all', label:'All Brands / Lines', logo:'' }));

  for (const descriptor of descriptors) {
    const row = root.createElement('div');
    row.className = 'catalogue-sidebar-choice-row';
    row.appendChild(createBrandLineButton(root, descriptor));

    const remove = root.createElement('button');
    remove.type = 'button';
    remove.className = 'catalogue-sidebar-remove';
    remove.dataset.brandLineRemove = descriptor.id;
    remove.title = `Hide ${descriptor.label} from this list`;
    remove.setAttribute('aria-label', `Hide ${descriptor.label} from this list`);
    remove.textContent = '×';
    remove.addEventListener('click', event => {
      event.stopPropagation();
      hideBrandLine(descriptor.id, view);
      // Hiding a chip must never leave the catalogue filtered by it.
      if (activeIdOf(root) === descriptor.id) applyBrandLineFilter(root, 'all', view);
      renderBrandLineButtons(root, container, 'all', view);
    });
    row.appendChild(remove);
    container.appendChild(row);
  }

  const hiddenCount = all.filter(descriptor => hidden.has(descriptor.id)).length;
  if (hiddenCount) {
    const restore = root.createElement('button');
    restore.type = 'button';
    restore.className = 'catalogue-sidebar-restore';
    restore.dataset.brandLineRestore = '';
    restore.textContent = `Restore hidden (${hiddenCount})`;
    restore.addEventListener('click', () => {
      restoreHiddenBrandLines(view);
      renderBrandLineButtons(root, container, activeIdOf(root), view);
    });
    container.appendChild(restore);
  }

  container.querySelectorAll('[data-brand-line-filter]').forEach(button => {
    button.addEventListener('click', () => applyBrandLineFilter(root, button.dataset.brandLineFilter, view));
  });
  applyBrandLineFilter(root, descriptors.some(item => item.id === activeId) || activeId === 'all' ? activeId : 'all', view);
}

function activeIdOf(root) {
  return root.querySelector?.('[data-brand-line-filter][aria-pressed="true"]')?.dataset.brandLineFilter || 'all';
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
    const row = root.createElement('div');
    row.className = 'catalogue-sidebar-choice-row';

    const button = root.createElement('button');
    button.type = 'button';
    button.className = 'catalogue-sidebar-choice';
    button.dataset.catalogueJump = jump.id;
    button.textContent = catalogueJumpLabel(jump, view);
    button.addEventListener('click', () => {
      const target = root.querySelector?.(`[data-recommendation-subsection="${jump.id}"]`) || root.getElementById?.(`recommendation-${jump.id}`);
      target?.scrollIntoView?.({ behavior:'smooth', block:'start' });
    });

    const rename = root.createElement('button');
    rename.type = 'button';
    rename.className = 'catalogue-sidebar-rename';
    rename.dataset.catalogueJumpRename = jump.id;
    rename.title = `Rename the ${jump.label} button`;
    rename.setAttribute('aria-label', `Rename the ${jump.label} button`);
    rename.textContent = '✎';
    rename.addEventListener('click', event => {
      event.stopPropagation();
      const current = catalogueJumpLabel(jump, view);
      const next = typeof view?.prompt === 'function' ? view.prompt('Button name', current) : null;
      if (next === null || next === undefined) return;
      renameCatalogueJump(jump.id, next, view);
      button.textContent = catalogueJumpLabel(jump, view);
    });

    row.append(button, rename);
    navButtons.appendChild(row);
  }
  navSection.append(navTitle, navButtons);

  const brandSection = root.createElement('section');
  brandSection.className = 'catalogue-sidebar-section';
  const brandTitle = root.createElement('button');
  brandTitle.type = 'button';
  brandTitle.className = 'catalogue-sidebar-heading catalogue-sidebar-toggle';
  brandTitle.dataset.brandLineToggle = '';
  const brandButtons = root.createElement('div');
  brandButtons.className = 'catalogue-sidebar-list';
  brandButtons.dataset.brandLineOptions = '';

  // Collapsed by default; the viewer's own choice is remembered per browser.
  let expanded = readSidebarPreferences(view).brandsExpanded === true;
  const applyExpanded = () => {
    brandTitle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    brandTitle.textContent = `${expanded ? '▾' : '▸'} BRANDS & LINES`;
    brandButtons.hidden = !expanded;
  };
  applyExpanded();
  brandTitle.addEventListener('click', () => {
    expanded = !expanded;
    setBrandsExpanded(expanded, view);
    applyExpanded();
  });

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
/* The per-card benchmark/actual/size/ratio strip is retired. The Value score it fed
   is still computed and still drives the medal and laurel, only the strip is gone. */
.value-calc{display:none!important}
.catalogue-sidebar-choice-row{display:flex;align-items:stretch;gap:4px}
.catalogue-sidebar-choice-row>.catalogue-sidebar-choice{flex:1 1 auto;min-width:0}
.catalogue-sidebar-remove,.catalogue-sidebar-rename{
  flex:0 0 auto;
  border:1px solid rgba(255,255,255,.18);
  background:transparent;
  color:inherit;
  border-radius:6px;
  cursor:pointer;
  padding:0 8px;
  font-size:13px;
  line-height:1;
  opacity:.45;
}
.catalogue-sidebar-remove:hover,.catalogue-sidebar-rename:hover{opacity:1}
.catalogue-sidebar-toggle{
  display:block;
  width:100%;
  text-align:left;
  background:transparent;
  border:0;
  padding:0;
  cursor:pointer;
  color:inherit;
  font:inherit;
  letter-spacing:inherit;
}
.catalogue-sidebar-restore{
  align-self:flex-start;
  background:transparent;
  border:1px dashed rgba(255,255,255,.25);
  color:inherit;
  border-radius:6px;
  cursor:pointer;
  padding:4px 8px;
  font-size:12px;
  opacity:.7;
}
.catalogue-sidebar-restore:hover{opacity:1}
#cards [data-recommendation-subsection]{scroll-margin-top:24px}
#${EXTRA_ID}{
  display:flex;
  flex-direction:column;
  gap:10px;
  margin:0 0 14px;
}
#${EXTRA_ID} .catalogue-sidebar-section{
  padding:10px;
  border:1px solid rgba(195,162,80,.35);
  border-radius:10px;
  background:rgba(10,9,7,.94);
}
#${EXTRA_ID} .catalogue-sidebar-heading{
  margin:0 0 8px;
  color:#d7bf7b;
  font-size:11px;
  font-weight:800;
  letter-spacing:.14em;
}
#${EXTRA_ID} .catalogue-sidebar-list{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:5px;
}
/* The display:grid rule above is an id+class selector, so it outranks the browser's
   built-in [hidden]{display:none}. Without this the hidden attribute sets but the list
   keeps rendering, and the collapse toggle looks dead. */
#${EXTRA_ID} .catalogue-sidebar-list[hidden]{display:none!important}
#${EXTRA_ID} .catalogue-sidebar-choice{
  width:100%;
  min-height:34px;
  display:flex;
  align-items:center;
  gap:8px;
  padding:7px 9px;
  border:1px solid rgba(255,255,255,.12);
  border-radius:7px;
  background:rgba(255,255,255,.035);
  color:inherit;
  font:inherit;
  line-height:1.2;
  text-align:left;
  cursor:pointer;
}
#${EXTRA_ID} .catalogue-sidebar-choice:hover{border-color:rgba(195,162,80,.62);background:rgba(195,162,80,.08)}
#${EXTRA_ID} .catalogue-sidebar-choice[aria-pressed="true"]{border-color:#c3a250;background:rgba(195,162,80,.16);color:#f5e7b8}
#${EXTRA_ID} .catalogue-brand-line-logo{width:24px;height:24px;object-fit:contain;flex:0 0 24px}
.catalogue-brand-line-empty{
  margin:10px 0 0;
  padding:9px 11px;
  border:1px dashed rgba(195,162,80,.28);
  border-radius:8px;
  color:rgba(255,255,255,.62);
  font-size:12px;
}
#${SIDEBAR_ID}{
  position:fixed;
  z-index:44;
  top:18px;
  /* The whole rail moves left by this much, and the cards move with it, so the layout
     stops sitting hard against the right edge of the window. The width subtracts the same
     amount, which keeps the rail's left edge exactly where it was rather than pushing it
     off-screen on a viewport that has no room to give. */
  --rail-shift:${RAIL_SHIFT}px;
  right:calc(50vw + 650px + var(--rail-shift));
  width:min(250px,calc(50vw - 660px - var(--rail-shift)));
  max-height:calc(100vh - 36px);
  overflow:auto;
  display:flex;
  flex-direction:column;
  gap:10px;
  scrollbar-width:thin;
}
#${SIDEBAR_ID} #${EXTRA_ID}{margin:0}
#${SIDEBAR_ID} #${EXTRA_ID} .catalogue-sidebar-list{grid-template-columns:1fr}
#${SIDEBAR_ID} .catalogue-convenience-toolbar{
  position:static!important;
  top:auto!important;
  width:100%!important;
  margin:0!important;
  padding:9px!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  gap:8px!important;
}
#${SIDEBAR_ID} .catalogue-convenience-toolbar .convenience-toolbar-group{
  width:100%!important;
  display:flex!important;
  align-items:center!important;
  gap:5px!important;
  flex-wrap:wrap!important;
}
#${SIDEBAR_ID} .controls{
  width:100%!important;
  margin:0!important;
  padding:10px!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  gap:10px!important;
  border:1px solid rgba(195,162,80,.35);
  border-radius:10px;
  background:rgba(10,9,7,.94);
}
#${SIDEBAR_ID} .sort-pair{
  width:100%!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  gap:8px!important;
}
#${SIDEBAR_ID} .controls label{display:block!important;width:100%!important}
#${SIDEBAR_ID} .controls select{
  display:block!important;
  width:100%!important;
  min-width:0!important;
  margin:4px 0 0!important;
  padding:7px 26px 7px 8px!important;
  font-size:12px!important;
}
#${SIDEBAR_ID} .toggle{
  width:100%!important;
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:5px!important;
}
#${SIDEBAR_ID} .toggle button{
  width:100%!important;
  padding:7px 8px!important;
  text-align:left!important;
  line-height:1.25!important;
}
@media(max-width:1659px){
  #${SIDEBAR_ID}{display:none!important}
}
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

  // The Worker renders catalogue cards server-side, while the subsection module may finish
  // rearranging them just after startup. Two bounded refreshes pick up that final structure
  // without a MutationObserver that could react to this module's own empty-state messages.
  view?.setTimeout?.(() => refreshBrandLineOptions(root, view), 0);
  view?.setTimeout?.(() => refreshBrandLineOptions(root, view), 300);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installControlSidebar(document, window), { once:true });
  } else {
    installControlSidebar(document, window);
  }
}

export { DESKTOP_QUERY, SIDEBAR_ID, EXTRA_ID, RAIL_SHIFT };
