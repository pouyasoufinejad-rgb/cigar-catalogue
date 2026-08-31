const STATE_API = '/api/catalogue-overrides';
const STORAGE_KEY = 'catalogue-direct-layout-v1';
const ADMIN_TOKEN_SESSION_KEY = 'cigar-catalogue-admin-token';
const LAYOUT_KEYS = ['imageScale', 'imageX', 'imageY', 'metaY'];
let adminTokenMemory = '';
let layoutCache = readLocalLayouts();
let mutationTimer = 0;
let applyingLayouts = false;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
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

async function fetchState() {
  const response = await fetch(STATE_API, { cache:'no-store', headers:{ accept:'application/json' } });
  if (!response.ok) throw new Error(`Could not load catalogue state (${response.status})`);
  return response.json();
}

function readLocalLayouts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeLocalLayouts() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutCache)); } catch (_) {}
}

function normaliseLayout(values = {}) {
  return {
    imageScale: Math.max(60, Math.min(180, Number(values.imageScale) || 100)),
    imageX: Math.max(-120, Math.min(120, Number(values.imageX) || 0)),
    imageY: Math.max(-120, Math.min(120, Number(values.imageY) || 0)),
    metaY: Math.max(-20, Math.min(80, Number(values.metaY) || 22))
  };
}

function layoutFromCard(card) {
  return normaliseLayout({
    imageScale: card?.dataset.directImageScale,
    imageX: card?.dataset.directImageX,
    imageY: card?.dataset.directImageY,
    metaY: card?.dataset.directMetaY
  });
}

function applyLayout(card, raw = {}) {
  if (!card) return;
  const layout = normaliseLayout(raw);
  card.dataset.directImageScale = String(layout.imageScale);
  card.dataset.directImageX = String(layout.imageX);
  card.dataset.directImageY = String(layout.imageY);
  card.dataset.directMetaY = String(layout.metaY);
  const image = card.querySelector('.artframe img');
  if (image) {
    image.style.setProperty('transform', `translate(${layout.imageX}px, ${layout.imageY}px) scale(${layout.imageScale / 100})`, 'important');
    image.style.setProperty('transform-origin', 'center center', 'important');
  }
  card.querySelectorAll('.artmeta-left,.artmeta-right').forEach(node => {
    node.style.setProperty('transform', `translateY(${layout.metaY}px)`, 'important');
  });
}

export function applyCachedLayouts() {
  if (applyingLayouts) return;
  applyingLayouts = true;
  try {
    for (const card of document.querySelectorAll('article.card[data-key]')) {
      const saved = layoutCache[card.dataset.key];
      if (saved) applyLayout(card, saved);
    }
  } finally {
    applyingLayouts = false;
  }
}

function scheduleCachedLayoutApply() {
  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(applyCachedLayouts, 0);
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
    ...layoutFromCard(card)
  };
}

function saveLocalLayout(key, patch) {
  layoutCache[key] = normaliseLayout(patch);
  writeLocalLayouts();
  applyCachedLayouts();
}

function layoutMatches(saved, expected) {
  if (!saved) return false;
  return LAYOUT_KEYS.every(key => Number(saved[key]) === Number(expected[key]));
}

export async function verifySavedLayout(key, patch) {
  let latest = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    latest = await fetchState();
    if (layoutMatches(latest.cards?.[key], patch)) return latest;
    await delay(500);
  }
  throw new Error('The server accepted the save but KV read-back still does not contain the layout values.');
}

async function saveSelectedVerified() {
  const card = document.querySelector('article.card.catalogue-direct-selected[data-key]');
  const button = document.querySelector('#catalogue-direct-controls [data-direct="save"]');
  if (!card || !button) return;
  const old = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const state = await fetchState();
    const key = card.dataset.key;
    const patch = directPatch(card);
    const cards = { ...(state.cards || {}) };
    cards[key] = { ...(cards[key] || {}), ...patch };
    const response = await adminWriteFetch(STATE_API, {
      method:'PUT',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ version:3, cards, sections:{ ...(state.sections || {}) } })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Save failed (${response.status})`);

    // A successful PUT is enough to preserve an immediate refresh in this browser,
    // even while Cloudflare KV is still propagating to subsequent reads.
    saveLocalLayout(key, patch);
    button.textContent = 'Verifying…';
    const verified = await verifySavedLayout(key, patch);
    const verifiedLayout = verified.cards?.[key];
    if (verifiedLayout) saveLocalLayout(key, verifiedLayout);
    button.textContent = 'Saved ✓';
    setTimeout(() => { button.textContent = old; button.disabled = false; }, 1000);
  } catch (error) {
    button.textContent = 'Save failed';
    button.disabled = false;
    globalThis.alert?.(error.message || String(error));
  }
}

function interceptDirectSave(event) {
  const save = event.target.closest?.('#catalogue-direct-controls [data-direct="save"]');
  if (!save) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  saveSelectedVerified();
}

async function waitForCatalogueHydration() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (window.catalogueOverridesReady) {
      try { await window.catalogueOverridesReady; } catch (_) {}
      return;
    }
    await delay(50);
  }
}

async function refreshRemoteLayouts() {
  try {
    const state = await fetchState();
    for (const [key, saved] of Object.entries(state.cards || {})) {
      if (LAYOUT_KEYS.some(name => saved?.[name] != null)) layoutCache[key] = normaliseLayout(saved);
    }
    writeLocalLayouts();
    applyCachedLayouts();
  } catch (_) {}
}

export function initDirectPersistence() {
  document.addEventListener('click', interceptDirectSave, { capture:true });
  applyCachedLayouts();
  waitForCatalogueHydration().then(refreshRemoteLayouts);
  const observer = new MutationObserver(mutations => {
    if (applyingLayouts) return;
    if (mutations.some(mutation => mutation.type === 'childList')) scheduleCachedLayoutApply();
  });
  observer.observe(document.body, { childList:true, subtree:true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDirectPersistence, { once:true });
  else initDirectPersistence();
}
