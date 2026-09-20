import {
  blendEffectiveRecord,
  normaliseBlendVariants,
  normaliseVariants
} from './catalogue-variants.mjs?v=blend-variants-1';
import {
  updateBlendVariant,
  updateSizeVariant,
  variantEditSnapshot
} from './catalogue-variant-edit-model.mjs?v=1';
import {
  applyBlendToCard,
  applyVariantToCard,
  setVariantState
} from './catalogue-variant-runtime.mjs?v=blend-variants-2';

const STATE_API = '/api/catalogue-overrides';
const ADMIN_TOKEN_SESSION_KEY = 'cigar-catalogue-admin-token';
const MODAL_ID = 'catalogue-variant-editor';
let adminTokenMemory = '';

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const text = value => String(value ?? '');

function readAdminToken() {
  if (adminTokenMemory) return adminTokenMemory;
  try { adminTokenMemory = sessionStorage.getItem(ADMIN_TOKEN_SESSION_KEY) || ''; }
  catch (_) { adminTokenMemory = ''; }
  return adminTokenMemory;
}

function requireAdminToken() {
  const existing = readAdminToken();
  if (existing) return existing;
  const token = text(globalThis.prompt?.('Admin token required to edit this variant.')).trim();
  if (!token) throw new Error('Admin token is required to save variant changes.');
  adminTokenMemory = token;
  try { sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, token); } catch (_) {}
  return token;
}

async function adminFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${requireAdminToken()}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    adminTokenMemory = '';
    try { sessionStorage.removeItem(ADMIN_TOKEN_SESSION_KEY); } catch (_) {}
  }
  return response;
}

async function fetchState() {
  const response = await fetch(`${STATE_API}?variant_edit=${Date.now()}`, { cache:'no-store', headers:{ accept:'application/json' } });
  if (!response.ok) throw new Error(`Could not load catalogue state (HTTP ${response.status}).`);
  return response.json();
}

function recordFromState(state, key) {
  const card = state?.cards?.[key];
  const entry = state?.entries?.[key];
  if (!card && !entry) return null;
  return { key, ...(card || {}), ...(entry || {}) };
}

function lines(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function listFromTextarea(value) {
  return text(value).split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function numberValue(form, name, { allowBlank = false, min = -Infinity, max = Infinity } = {}) {
  const raw = text(form.elements[name]?.value).trim();
  if (!raw && allowBlank) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return allowBlank ? null : 0;
  return Math.max(min, Math.min(max, value));
}

function field(label, name, value = '', type = 'text', attrs = '') {
  if (type === 'textarea') {
    return `<label class="variant-edit-field variant-edit-wide"><span>${label}</span><textarea name="${name}" ${attrs}>${escapeHtml(value)}</textarea></label>`;
  }
  return `<label class="variant-edit-field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}></label>`;
}

function escapeHtml(value) {
  return text(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function ensureStyle() {
  if (document.getElementById('catalogue-variant-editor-style')) return;
  const style = document.createElement('style');
  style.id = 'catalogue-variant-editor-style';
  style.textContent = `
.catalogue-variant-edit-button{border:1px solid rgba(195,162,80,.5);border-radius:6px;background:rgba(255,250,240,.7);color:#6c4a0d;font:700 10px Cinzel,serif;letter-spacing:.05em;text-transform:uppercase;padding:3px 7px;cursor:pointer}
#${MODAL_ID}[hidden]{display:none}
#${MODAL_ID}{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px}
#${MODAL_ID} .variant-edit-dialog{width:min(900px,96vw);max-height:92vh;overflow:auto;border:1px solid rgba(217,188,112,.65);border-radius:14px;background:#14110d;color:#eee;box-shadow:0 22px 70px rgba(0,0,0,.72);padding:18px}
#${MODAL_ID} .variant-edit-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
#${MODAL_ID} .variant-edit-head h2{margin:0;flex:1;color:#d9bc70;font:700 18px Cinzel,serif}
#${MODAL_ID} .variant-edit-head button,#${MODAL_ID} .variant-edit-actions button{border:1px solid rgba(217,188,112,.55);background:#211a13;color:#f3ead5;border-radius:8px;padding:7px 11px;cursor:pointer}
#${MODAL_ID} .variant-edit-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
#${MODAL_ID} .variant-edit-field{display:flex;flex-direction:column;gap:4px;font:11px system-ui,sans-serif}
#${MODAL_ID} .variant-edit-field span{color:#cdb681;font-weight:700}
#${MODAL_ID} .variant-edit-field input,#${MODAL_ID} .variant-edit-field textarea,#${MODAL_ID} .variant-edit-field select{box-sizing:border-box;width:100%;border:1px solid rgba(217,188,112,.35);border-radius:7px;background:#0c0a08;color:#f3ead5;padding:7px;font:12px/1.35 system-ui,sans-serif}
#${MODAL_ID} .variant-edit-field textarea{min-height:82px;resize:vertical}
#${MODAL_ID} .variant-edit-wide{grid-column:1/-1}
#${MODAL_ID} .variant-edit-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
#${MODAL_ID} .variant-edit-status{margin-right:auto;align-self:center;color:#cdb681;font:11px system-ui,sans-serif}
@media(max-width:760px){#${MODAL_ID} .variant-edit-grid{grid-template-columns:1fr 1fr}}
@media(max-width:520px){#${MODAL_ID}{padding:8px}#${MODAL_ID} .variant-edit-grid{grid-template-columns:1fr}}
`;
  document.head.appendChild(style);
}

function ensureModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.hidden = true;
  modal.innerHTML = '<div class="variant-edit-dialog" role="dialog" aria-modal="true"><div class="variant-edit-head"><h2>Edit variant</h2><button type="button" data-variant-edit-close>Close</button></div><form><div class="variant-edit-grid"></div><div class="variant-edit-actions"><span class="variant-edit-status"></span><button type="button" data-variant-edit-cancel>Cancel</button><button type="submit">Save variant</button></div></form></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest?.('[data-variant-edit-close],[data-variant-edit-cancel]')) closeEditor();
  });
  modal.querySelector('form').addEventListener('submit', saveEditor);
  return modal;
}

function renderFields(kind, snapshot) {
  const effective = snapshot.effective || {};
  const raw = snapshot.raw || {};
  const value = name => raw[name] ?? effective[name] ?? '';
  const fields = [
    field('Label','label', value('label')),
    field('Title','title', value('title')),
    field('Eyebrow','eyebrow', value('eyebrow')),
    field('Length (in)','length', value('length'),'number','step="0.01" min="0"'),
    field('Ring gauge','ring', value('ring'),'number','step="1" min="0"'),
    field('Package price (AUD)','packagePrice', value('packagePrice'),'number','step="0.01" min="0"'),
    field('Package count','packageCount', value('packageCount') || 1,'number','step="1" min="1" max="10"'),
    field('Package label','packageLabel', value('packageLabel')),
    field('Per-stick price override','price', value('price'),'number','step="0.01" min="0"'),
    field('Stock','stock', value('stock')),
    field('Smoke time','smokeTime', value('smokeTime')),
    field('Image URL/path','imageUrl', value('imageUrl')),
    field('Price checked','priceChecked', value('priceChecked')),
    field('Stock checked','stockChecked', value('stockChecked')),
    field('Retailer links, one per line','retailerLinks', lines(value('retailerLinks')),'textarea'),
    field('Summary HTML','summaryHtml', value('summaryHtml'),'textarea'),
    field('Note HTML','noteHtml', value('noteHtml'),'textarea'),
    field('Practical, one line per row','practicalLines', lines(value('practicalLines')),'textarea')
  ];
  if (kind === 'blend') {
    fields.splice(11, 0,
      field('Country','country', value('country')),
      field('Strength /10','strength', value('strength'),'number','step="1" min="1" max="10"'),
      field('Quality /10','quality', value('quality'),'number','step="1" min="1" max="10"'),
      field('Flavour /10','flavour', value('flavour'),'number','step="1" min="1" max="10"'),
      field('Risk 1–3','risk', value('risk'),'number','step="1" min="1" max="3"')
    );
    fields.push(
      field('Production, one line per row','productionLines', lines(value('productionLines')),'textarea'),
      field('Experience tags, one per line','experienceTags', lines(value('experienceTags')),'textarea')
    );
  }
  return fields.join('');
}

let editContext = null;

async function openEditor(card, kind) {
  const key = card?.dataset?.key || '';
  if (!key) return;
  const state = await fetchState();
  const record = recordFromState(state, key);
  if (!record) throw new Error('Catalogue record not found.');
  const blendId = card.dataset.activeBlend || '';
  const sizeId = card.dataset.activeVariant || '';
  const snapshot = variantEditSnapshot(record, kind, blendId, sizeId);
  if (!snapshot.id) throw new Error(`No active ${kind} variant found.`);

  const modal = ensureModal();
  const label = snapshot.raw?.label || snapshot.effective?.title || snapshot.id;
  modal.querySelector('h2').textContent = `Edit ${kind} · ${label}`;
  modal.querySelector('.variant-edit-grid').innerHTML = renderFields(kind, snapshot);
  modal.querySelector('.variant-edit-status').textContent = '';
  editContext = { key, kind, blendId, sizeId, state, record, card };
  modal.hidden = false;
  modal.querySelector('input,textarea,select')?.focus?.({ preventScroll:true });
}

function closeEditor() {
  const modal = document.getElementById(MODAL_ID);
  if (modal) modal.hidden = true;
  editContext = null;
}

function formPatch(form, kind) {
  const patch = {
    label:text(form.elements.label.value).trim(),
    title:text(form.elements.title.value).trim(),
    eyebrow:text(form.elements.eyebrow.value).trim(),
    packageLabel:text(form.elements.packageLabel.value).trim(),
    stock:['in','out','unknown'].includes(text(form.elements.stock.value).trim()) ? text(form.elements.stock.value).trim() : 'unknown',
    smokeTime:text(form.elements.smokeTime.value).trim(),
    retailerLinks:listFromTextarea(form.elements.retailerLinks.value),
    summaryHtml:text(form.elements.summaryHtml.value),
    noteHtml:text(form.elements.noteHtml.value),
    practicalLines:listFromTextarea(form.elements.practicalLines.value),
    priceChecked:text(form.elements.priceChecked.value).trim(),
    stockChecked:text(form.elements.stockChecked.value).trim()
  };
  const packageCount = Math.round(numberValue(form,'packageCount',{min:1,max:10}));
  const length = numberValue(form,'length',{allowBlank:true,min:0});
  const ring = numberValue(form,'ring',{allowBlank:true,min:0,max:100});
  const packagePrice = numberValue(form,'packagePrice',{allowBlank:true,min:0});
  const price = numberValue(form,'price',{allowBlank:true,min:0});
  patch.packageCount = packageCount || 1;
  if (length) patch.length = length;
  if (ring) patch.ring = Math.round(ring);
  if (packagePrice) patch.packagePrice = packagePrice;
  if (price) patch.price = price;
  const imageUrl = text(form.elements.imageUrl.value).trim();
  if (imageUrl) patch.imageUrl = imageUrl;

  if (kind === 'blend') {
    patch.country = text(form.elements.country.value).trim();
    patch.productionLines = listFromTextarea(form.elements.productionLines.value);
    patch.experienceTags = listFromTextarea(form.elements.experienceTags.value);
    for (const name of ['strength','quality']) {
      const value = numberValue(form,name,{allowBlank:true,min:1,max:10});
      if (value) patch[name] = Math.round(value);
    }
    const flavour = numberValue(form,'flavour',{allowBlank:true,min:1,max:10});
    patch.flavour = flavour ? Math.round(flavour) : null;
    const risk = numberValue(form,'risk',{allowBlank:true,min:1,max:3});
    if (risk) patch.risk = Math.round(risk);
  }
  return patch;
}

async function saveEditor(event) {
  event.preventDefault();
  if (!editContext) return;
  const form = event.currentTarget;
  const status = form.querySelector('.variant-edit-status');
  const submit = form.querySelector('button[type="submit"]');
  status.textContent = 'Saving…';
  submit.disabled = true;
  try {
    const fresh = await fetchState();
    const record = recordFromState(fresh, editContext.key);
    if (!record) throw new Error('Catalogue record no longer exists.');
    const patch = formPatch(form, editContext.kind);
    let updated;
    if (editContext.kind === 'blend') {
      updated = updateBlendVariant(record, editContext.blendId, patch);
    } else {
      updated = updateSizeVariant(record, editContext.sizeId, patch, editContext.blendId);
    }

    const cards = { ...(fresh.cards || {}) };
    const entries = { ...(fresh.entries || {}) };
    const structuralPatch = {};
    if (Array.isArray(updated.blendVariants)) structuralPatch.blendVariants = clone(updated.blendVariants);
    if (Array.isArray(updated.sizeVariants)) structuralPatch.sizeVariants = clone(updated.sizeVariants);
    if (updated.defaultBlendVariantId) structuralPatch.defaultBlendVariantId = updated.defaultBlendVariantId;
    if (updated.defaultVariantId) structuralPatch.defaultVariantId = updated.defaultVariantId;
    cards[editContext.key] = { ...(cards[editContext.key] || {}), ...structuralPatch };
    if (entries[editContext.key]) entries[editContext.key] = { ...entries[editContext.key], ...structuralPatch };

    const response = await adminFetch(STATE_API, {
      method:'PUT',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ version:3, cards, sections:{ ...(fresh.sections || {}) }, entries })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Save failed (HTTP ${response.status}).`);

    const saved = await fetchState();
    setVariantState(saved);
    const savedRecord = recordFromState(saved, editContext.key);
    if (savedRecord) {
      if (normaliseBlendVariants(savedRecord).length) {
        applyBlendToCard(editContext.card, savedRecord, editContext.blendId, editContext.sizeId);
      } else if (editContext.sizeId) {
        applyVariantToCard(editContext.card, savedRecord, editContext.sizeId);
      }
    }
    status.textContent = 'Saved ✓';
    setTimeout(closeEditor, 450);
  } catch (error) {
    status.textContent = error.message || 'Save failed';
    submit.disabled = false;
  }
}

function bindButtons(root = document) {
  const editing = document.body?.classList?.contains('catalogue-direct-edit-mode')
    || Boolean(document.getElementById('catalogue-admin-panel'));
  if (!editing) {
    root.querySelectorAll?.('.catalogue-variant-edit-button').forEach(button => button.remove());
    return;
  }
  root.querySelectorAll?.('.blend-variants').forEach(host => {
    if (host.querySelector('.catalogue-variant-edit-blend')) return;
    const card = host.closest('article.card[data-key]');
    if (!card) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalogue-variant-edit-button catalogue-variant-edit-blend';
    button.textContent = 'Edit blend';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openEditor(card, 'blend').catch(error => globalThis.alert?.(error.message || String(error)));
    });
    host.appendChild(button);
  });
  root.querySelectorAll?.('.size-variants:not([hidden])').forEach(host => {
    if (host.querySelector('.catalogue-variant-edit-size')) return;
    const card = host.closest('article.card[data-key]');
    if (!card) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalogue-variant-edit-button catalogue-variant-edit-size';
    button.textContent = 'Edit size';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openEditor(card, 'size').catch(error => globalThis.alert?.(error.message || String(error)));
    });
    host.appendChild(button);
  });
}

export function initVariantEditor() {
  ensureStyle();
  ensureModal();
  bindButtons();
  const observer = new MutationObserver(() => bindButtons());
  observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden','class'] });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initVariantEditor, { once:true });
  else initVariantEditor();
}
