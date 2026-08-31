const STATE_API = '/api/catalogue-overrides';
const STYLE_ID = 'catalogue-direct-edit-style';
const ADMIN_TOKEN_SESSION_KEY = 'cigar-catalogue-admin-token';
let adminTokenMemory = '';
let editMode = false;
let selected = null;
let allowModalOpen = false;
let panel = null;

const q = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const stripRankPrefix = value => String(value || '').replace(/^(?:T\d+|Taster|No\.\s*\d+|Archived)\s*[—–-]\s*/, '').trim();

function readAdminToken() {
  if (adminTokenMemory) return adminTokenMemory;
  try { adminTokenMemory = sessionStorage.getItem(ADMIN_TOKEN_SESSION_KEY) || ''; }
  catch (_) { adminTokenMemory = ''; }
  return adminTokenMemory;
}

function requireAdminToken() {
  const existing = readAdminToken();
  if (existing) return existing;
  const token = String(globalThis.prompt?.('Admin token required to change the catalogue.') || '').trim();
  if (!token) throw new Error('Admin token is required to save catalogue changes.');
  adminTokenMemory = token;
  try { sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, token); } catch (_) {}
  return token;
}

async function adminWriteFetch(url, options = {}) {
  const token = requireAdminToken();
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    adminTokenMemory = '';
    try { sessionStorage.removeItem(ADMIN_TOKEN_SESSION_KEY); } catch (_) {}
  }
  return response;
}

function ensureStyles() {
  if (q(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@media (max-width:700px){
  body article.card .artmeta-left,
  body article.card .artmeta-right{transform:translateY(22px)!important}
}
body.catalogue-direct-edit-mode article.card[data-key]{cursor:pointer;outline:1px dashed rgba(217,188,112,.28);outline-offset:3px}
body.catalogue-direct-edit-mode article.card[data-key]:hover{outline-color:rgba(217,188,112,.72)}
body.catalogue-direct-edit-mode article.card.catalogue-direct-selected{outline:2px solid #d9bc70;outline-offset:5px;z-index:3}
body.catalogue-direct-edit-mode .catalogue-direct-editable{outline:1px dashed rgba(217,188,112,.55);outline-offset:2px;cursor:text}
body.catalogue-direct-edit-mode .catalogue-direct-editable:focus{outline:2px solid #d9bc70;background:rgba(0,0,0,.32)}
#catalogue-direct-controls{position:fixed;z-index:9998;left:50%;bottom:12px;transform:translateX(-50%);width:min(94vw,620px);padding:10px 12px;border:1px solid rgba(217,188,112,.55);border-radius:12px;background:rgba(12,10,8,.96);box-shadow:0 12px 36px rgba(0,0,0,.5);color:#eee;font:12px/1.35 system-ui,sans-serif;display:none}
body.catalogue-direct-edit-mode #catalogue-direct-controls{display:block}
#catalogue-direct-controls .direct-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#catalogue-direct-controls .direct-title{font-weight:700;flex:1;min-width:150px;color:#d9bc70}
#catalogue-direct-controls button{border:1px solid rgba(217,188,112,.55);background:#19140f;color:#f3ead5;border-radius:8px;padding:7px 10px}
#catalogue-direct-controls button:disabled{opacity:.4}
#catalogue-direct-controls .direct-sliders{display:grid;grid-template-columns:74px 1fr 42px;gap:4px 8px;align-items:center;margin-top:8px}
#catalogue-direct-controls input[type=range]{width:100%}
#catalogue-direct-controls .direct-hint{opacity:.68;margin-top:6px}
`;
  document.head.appendChild(style);
}

function ensurePanel() {
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'catalogue-direct-controls';
  panel.innerHTML = `<div class="direct-row"><span class="direct-title">Direct catalogue editing</span><button type="button" data-direct="save">Save</button><button type="button" data-direct="more">More fields</button><button type="button" data-direct="finish">Finish</button></div>
<div class="direct-sliders">
<label>Image size</label><input data-direct-range="imageScale" type="range" min="60" max="180" step="1" value="100"><output data-direct-out="imageScale">100%</output>
<label>Image X</label><input data-direct-range="imageX" type="range" min="-120" max="120" step="1" value="0"><output data-direct-out="imageX">0</output>
<label>Image Y</label><input data-direct-range="imageY" type="range" min="-120" max="120" step="1" value="0"><output data-direct-out="imageY">0</output>
<label>Text Y</label><input data-direct-range="metaY" type="range" min="-20" max="80" step="1" value="22"><output data-direct-out="metaY">22</output>
</div><div class="direct-hint">Tap a card, then tap its Description, note, Experience, Production, Practical or eyebrow text to type directly.</div>`;
  document.body.appendChild(panel);
  panel.addEventListener('click', onPanelClick);
  panel.addEventListener('input', onRangeInput);
  return panel;
}

function setEditable(card, enabled) {
  const selectors = ['.summary','.mog-note','.eyebrow','.artmeta-left','.artmeta-right','.tag-items'];
  selectors.forEach(selector => {
    card.querySelectorAll(selector).forEach(node => {
      node.contentEditable = enabled ? 'true' : 'false';
      node.classList.toggle('catalogue-direct-editable', enabled);
      if (enabled) node.spellcheck = true;
    });
  });
}

function selectInExistingAdmin(card) {
  const select = q('catalogue-admin-card');
  if (!select) return;
  if (!Array.from(select.options).some(option => option.value === card.dataset.key)) return;
  select.value = card.dataset.key;
  select.dispatchEvent(new Event('change', { bubbles:true }));
}

function readLayout(card) {
  return {
    imageScale: Number(card.dataset.directImageScale || 100),
    imageX: Number(card.dataset.directImageX || 0),
    imageY: Number(card.dataset.directImageY || 0),
    metaY: Number(card.dataset.directMetaY || 22)
  };
}

function applyLayout(card, values = {}) {
  if (!card) return;
  const scale = clamp(values.imageScale ?? card.dataset.directImageScale ?? 100, 60, 180);
  const x = clamp(values.imageX ?? card.dataset.directImageX ?? 0, -120, 120);
  const y = clamp(values.imageY ?? card.dataset.directImageY ?? 0, -120, 120);
  const metaY = clamp(values.metaY ?? card.dataset.directMetaY ?? 22, -20, 80);
  card.dataset.directImageScale = String(scale);
  card.dataset.directImageX = String(x);
  card.dataset.directImageY = String(y);
  card.dataset.directMetaY = String(metaY);
  const image = card.querySelector('.artframe img');
  if (image) {
    image.style.setProperty('transform', `translate(${x}px, ${y}px) scale(${scale / 100})`, 'important');
    image.style.setProperty('transform-origin', 'center center', 'important');
  }
  card.querySelectorAll('.artmeta-left,.artmeta-right').forEach(node => {
    node.style.setProperty('transform', `translateY(${metaY}px)`, 'important');
  });
}

function updatePanelFor(card) {
  ensurePanel();
  panel.querySelector('.direct-title').textContent = card ? `Editing · ${card.querySelector('h3')?.textContent.trim() || card.dataset.key}` : 'Direct catalogue editing · tap a card';
  panel.querySelectorAll('button[data-direct="save"],button[data-direct="more"]').forEach(button => { button.disabled = !card; });
  if (!card) return;
  const layout = readLayout(card);
  for (const [name, value] of Object.entries(layout)) {
    const input = panel.querySelector(`[data-direct-range="${name}"]`);
    if (input) input.value = String(value);
    const out = panel.querySelector(`[data-direct-out="${name}"]`);
    if (out) out.textContent = name === 'imageScale' ? `${value}%` : String(value);
  }
}

function selectCard(card) {
  if (selected === card) return;
  if (selected) {
    setEditable(selected, false);
    selected.classList.remove('catalogue-direct-selected');
  }
  selected = card;
  selected.classList.add('catalogue-direct-selected');
  setEditable(selected, true);
  selectInExistingAdmin(selected);
  updatePanelFor(selected);
  selected.scrollIntoView?.({ block:'nearest', behavior:'smooth' });
}

function enterEditMode() {
  editMode = true;
  ensureStyles();
  ensurePanel();
  document.body.classList.add('catalogue-direct-edit-mode');
  const toggle = q('catalogue-admin-toggle');
  if (toggle) toggle.textContent = 'Finish editing';
  updatePanelFor(selected);
}

function exitEditMode() {
  editMode = false;
  document.body.classList.remove('catalogue-direct-edit-mode');
  if (selected) {
    setEditable(selected, false);
    selected.classList.remove('catalogue-direct-selected');
  }
  selected = null;
  const toggle = q('catalogue-admin-toggle');
  if (toggle) toggle.textContent = 'Edit catalogue';
  updatePanelFor(null);
}

function onToggleCapture(event) {
  if (allowModalOpen) return;
  const toggle = event.target.closest?.('#catalogue-admin-toggle');
  if (!toggle) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (editMode) exitEditMode(); else enterEditMode();
}

function onDocumentClick(event) {
  if (!editMode) return;
  if (event.target.closest?.('#catalogue-direct-controls')) return;
  const card = event.target.closest?.('article.card[data-key]');
  if (!card) return;
  const editingText = selected === card && event.target.closest?.('.catalogue-direct-editable');
  if (editingText) return;
  event.preventDefault();
  event.stopPropagation();
  selectCard(card);
}

function artmetaHtml(card, selector) {
  const node = card.querySelector(selector);
  if (!node) return '';
  return Array.from(node.children).filter(child => !child.classList.contains('artmeta-title')).map(child => child.outerHTML).join('');
}

function experienceTags(card) {
  return Array.from(card.querySelectorAll('.tag-items .tag-chip')).map(node => node.textContent.trim()).filter(Boolean);
}

function directPatch(card) {
  return {
    summaryHtml: card.querySelector('.summary')?.innerHTML || '',
    noteHtml: card.querySelector('.mog-note')?.innerHTML || '',
    eyebrow: stripRankPrefix(card.querySelector('.eyebrow')?.textContent || ''),
    experienceTags: experienceTags(card),
    productionHtml: artmetaHtml(card, '.artmeta-left'),
    practicalHtml: artmetaHtml(card, '.artmeta-right'),
    ...readLayout(card)
  };
}

async function fetchState() {
  const response = await fetch(STATE_API, { cache:'no-store', headers:{ accept:'application/json' } });
  if (!response.ok) throw new Error(`Could not load catalogue state (${response.status})`);
  return response.json();
}

async function saveSelected() {
  if (!selected) return;
  const save = panel.querySelector('[data-direct="save"]');
  const old = save.textContent;
  save.disabled = true;
  save.textContent = 'Saving…';
  try {
    const state = await fetchState();
    const key = selected.dataset.key;
    const cards = { ...(state.cards || {}) };
    cards[key] = { ...(cards[key] || {}), ...directPatch(selected) };
    const response = await adminWriteFetch(STATE_API, {
      method:'PUT',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ version:3, cards, sections:{ ...(state.sections || {}) } })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Save failed (${response.status})`);
    save.textContent = 'Saved';
    setTimeout(() => { save.textContent = old; save.disabled = false; }, 900);
  } catch (error) {
    save.textContent = 'Save failed';
    save.disabled = false;
    globalThis.alert?.(error.message || String(error));
  }
}

function openMoreFields() {
  if (!selected) return;
  selectInExistingAdmin(selected);
  allowModalOpen = true;
  q('catalogue-admin-toggle')?.click();
  allowModalOpen = false;
  setTimeout(() => q('catalogue-admin-reload')?.click(), 0);
}

function onPanelClick(event) {
  const action = event.target.closest?.('[data-direct]')?.dataset.direct;
  if (action === 'save') saveSelected();
  else if (action === 'more') openMoreFields();
  else if (action === 'finish') exitEditMode();
}

function onRangeInput(event) {
  const name = event.target.dataset.directRange;
  if (!name || !selected) return;
  const value = Number(event.target.value);
  const out = panel.querySelector(`[data-direct-out="${name}"]`);
  if (out) out.textContent = name === 'imageScale' ? `${value}%` : String(value);
  applyLayout(selected, { [name]:value });
}

async function applySavedLayouts() {
  try {
    const state = await fetchState();
    for (const card of document.querySelectorAll('article.card[data-key]')) {
      const saved = state.cards?.[card.dataset.key];
      if (!saved) continue;
      if (['imageScale','imageX','imageY','metaY'].some(key => saved[key] != null)) applyLayout(card, saved);
    }
  } catch (_) {}
}

async function waitForCatalogueHydration() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (window.catalogueOverridesReady) {
      try { await window.catalogueOverridesReady; } catch (_) {}
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function restoreSavedLayoutsAfterHydration() {
  await waitForCatalogueHydration();
  await applySavedLayouts();
}

export function initDirectCardEditing() {
  ensureStyles();
  ensurePanel();
  document.addEventListener('click', onToggleCapture, { capture: true });
  document.addEventListener('click', onDocumentClick, true);
  restoreSavedLayoutsAfterHydration();
  document.addEventListener('catalogue:cards-refreshed', applySavedLayouts);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDirectCardEditing, { once:true });
else initDirectCardEditing();
