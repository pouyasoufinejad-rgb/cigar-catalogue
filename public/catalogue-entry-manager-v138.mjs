const STATE_API = '/api/catalogue-overrides';
const ENTRY_API = '/api/catalogue-entry/';
const IMAGE_API = '/api/catalogue-image/';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const TODAY = new Date().toISOString().slice(0, 10);

const q = id => document.getElementById(id);
const clamp = (value, min, max, fallback = min) => {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
};

export function sanitiseKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export function deriveSize(length, ring) {
  const l = Number(length) || 0;
  const r = Number(ring) || 0;
  if (l >= 4 && r >= 32) return 'gold';
  if (l >= 4 && r >= 28) return 'silver';
  return 'bronze';
}

function numberFrom(text, fallback = 0) {
  const match = String(text || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function ratingNode(card, label) {
  return Array.from(card?.querySelectorAll('.rating') || []).find(node =>
    node.querySelector(':scope > span')?.textContent.trim().toLowerCase() === label.toLowerCase()
  ) || null;
}

function scoreFromCard(card, label, fallback = 5) {
  const match = ratingNode(card, label)?.querySelector('.subscore')?.textContent.match(/(\d+)\s*\/\s*10/);
  return match ? Number(match[1]) : fallback;
}

function sizeFromCard(card) {
  const node = ratingNode(card, 'Size');
  if (node?.classList.contains('gold')) return 'gold';
  if (node?.classList.contains('silver')) return 'silver';
  return 'bronze';
}

function titleFromCard(card) {
  const h3 = card?.querySelector('h3');
  if (!h3) return '';
  const clone = h3.cloneNode(true);
  clone.querySelector('span')?.remove();
  return clone.textContent.trim();
}

function cleanEyebrow(card) {
  return (card?.querySelector('.eyebrow')?.textContent || '')
    .replace(/^(?:T\d+|Taster|No\.\s*\d+|Archived)\s*[—–-]\s*/, '')
    .trim();
}

function linksFromCard(card) {
  return Array.from(card?.querySelectorAll('a.shop[href]') || []).map(link => link.href).filter(Boolean);
}

function entryFromCard(card) {
  if (!card) return null;
  const facts = card.querySelectorAll('.facts > div');
  const art = card.querySelector('.artframe');
  const experienceGroup = Array.from(card.querySelectorAll('.tag-group')).find(group =>
    group.querySelector('.tag-label')?.textContent.trim().toLowerCase() === 'experience'
  );
  return {
    key: card.dataset.key || '',
    brand: card.querySelector('h3 span')?.textContent.trim() || '',
    title: titleFromCard(card),
    eyebrow: cleanEyebrow(card) || 'Catalogue entry',
    packagePrice: numberFrom(facts[0]?.querySelector('b')?.textContent, Number(card.dataset.price) || 0),
    packageLabel: facts[0]?.querySelector('small')?.textContent.trim() || 'single cigar',
    price: Number(card.dataset.price) || numberFrom(facts[1]?.querySelector('b')?.textContent),
    length: Number(art?.dataset.visualLength) || 0,
    ring: Number(art?.dataset.visualRing) || 0,
    country: card.querySelector('.country-name')?.textContent.trim() || 'Unknown',
    strength: scoreFromCard(card, 'Strength', 5),
    quality: scoreFromCard(card, 'Quality', 5),
    size: sizeFromCard(card),
    risk: clamp(card.dataset.risk, 1, 3, 1),
    stock: ['in', 'out', 'unknown'].includes(card.dataset.stock) ? card.dataset.stock : 'unknown',
    stockPin: ['in', 'out', 'hold'].includes(card.dataset.stockPin) ? card.dataset.stockPin : '',
    rank: Math.max(1, Number(card.dataset.rank) || 1),
    taster: card.dataset.taster === '1',
    archived: card.dataset.archived === '1',
    archivedAt: card.dataset.archivedAt || '',
    experienceTags: experienceGroup ? Array.from(experienceGroup.querySelectorAll('.tag-chip')).map(node => node.textContent.trim()).filter(Boolean) : [],
    summaryHtml: card.querySelector('.summary')?.innerHTML || '',
    noteHtml: card.querySelector('.mog-note')?.innerHTML || '',
    productionLines: Array.from(card.querySelectorAll('.artmeta-left .artmeta-line')).map(node => node.textContent.trim()).filter(Boolean),
    practicalLines: Array.from(card.querySelectorAll('.artmeta-right .artmeta-line')).map(node => node.textContent.trim()).filter(Boolean),
    smokeTime: card.querySelector('.artmeta-bottom')?.textContent.trim() || '',
    retailerLinks: linksFromCard(card),
    imageUrl: card.dataset.dynamicEntry === '1' ? card.querySelector('.artframe img')?.getAttribute('src') || '' : '',
    imageSourceKey: '',
    imageVersion: 0,
    priceChecked: card.dataset.priceChecked || TODAY,
    stockChecked: card.dataset.stockChecked || TODAY
  };
}

export function nextRank(taster) {
  const cards = Array.from(document.querySelectorAll('article.card[data-key]'))
    .filter(card => card.dataset.archived !== '1' && (card.dataset.taster === '1') === Boolean(taster));
  return cards.reduce((max, card) => Math.max(max, Number(card.dataset.rank) || 0), 0) + 1;
}

function modalMarkup() {
  return `
<div id="catalogue-entry-manager-v138" class="catalogue-admin" hidden>
  <aside class="catalogue-admin-panel" role="dialog" aria-modal="true" aria-labelledby="catalogue-entry-manager-title">
    <button class="catalogue-admin-close" id="catalogue-entry-manager-close" type="button" aria-label="Close">×</button>
    <h2 id="catalogue-entry-manager-title">Entry structure</h2>
    <p class="catalogue-admin-intro">Create the cigar itself here. After save, the original catalogue editor opens automatically for ranking, archive status, Value, Experience, Production, Practical, descriptions, laurels and the other catalogue-specific fields.</p>
    <div class="catalogue-admin-grid">
      <div class="catalogue-admin-field wide"><label for="catalogue-entry-key">Entry key</label><input id="catalogue-entry-key" type="text" maxlength="96" autocomplete="off"><small class="catalogue-admin-derived">Generated automatically for new entries. Existing entry keys stay fixed.</small></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-type">Catalogue type</label><select id="catalogue-entry-type"><option value="main">Recommendation</option><option value="taster">Taster</option></select></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-risk">Risk</label><select id="catalogue-entry-risk"><option value="1">Low</option><option value="2">Moderate</option><option value="3">High</option></select></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-brand">Brand</label><input id="catalogue-entry-brand" type="text"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-title">Product / vitola title</label><input id="catalogue-entry-title" type="text"></div>
      <div class="catalogue-admin-field wide"><label for="catalogue-entry-eyebrow">Ranking caption</label><input id="catalogue-entry-eyebrow" type="text"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-package-price">Package price A$</label><input id="catalogue-entry-package-price" type="number" min="0" step="0.01"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-package-label">Package label</label><input id="catalogue-entry-package-label" type="text" placeholder="single cigar / tin of 10"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-price">Per-stick price A$</label><input id="catalogue-entry-price" type="number" min="0" step="0.01"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-country">Country</label><input id="catalogue-entry-country" type="text" placeholder="Dominican Republic"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-length">Length (inches)</label><input id="catalogue-entry-length" type="number" min="0" step="0.05"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-ring">Ring gauge</label><input id="catalogue-entry-ring" type="number" min="0" max="100" step="1"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-strength">Initial Strength /10</label><input id="catalogue-entry-strength" type="number" min="1" max="10" step="1"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-quality">Initial Quality /10</label><input id="catalogue-entry-quality" type="number" min="1" max="10" step="1"></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-size">Initial Size medal</label><select id="catalogue-entry-size"><option value="auto">Automatic from dimensions</option><option value="gold">Gold</option><option value="silver">Silver</option><option value="bronze">Bronze</option></select></div>
      <div class="catalogue-admin-field"><label for="catalogue-entry-stock">Initial stock</label><select id="catalogue-entry-stock"><option value="in">Available</option><option value="out">Unavailable</option><option value="unknown">Unknown</option></select></div>
      <div class="catalogue-admin-field wide"><label for="catalogue-entry-retailers">Retailer URLs (one per line)</label><textarea id="catalogue-entry-retailers" spellcheck="false"></textarea></div>
      <div class="catalogue-admin-field wide"><label for="catalogue-entry-image">Image</label><input id="catalogue-entry-image" type="file" accept="image/png,image/jpeg,image/webp"><small class="catalogue-admin-derived">PNG/JPEG/WebP up to 12 MiB. The original file is stored without forced recompression.</small></div>
    </div>
    <div class="catalogue-admin-divider"></div>
    <div class="catalogue-admin-actions">
      <button class="primary" id="catalogue-entry-save" type="button">Save entry</button>
      <button id="catalogue-entry-cancel" type="button">Cancel</button>
    </div>
    <div id="catalogue-entry-status" class="catalogue-admin-status" aria-live="polite">Ready.</div>
  </aside>
</div>`;
}

function ensureUi() {
  if (!q('catalogue-entry-manager-v138')) document.body.insertAdjacentHTML('beforeend', modalMarkup());
  if (!q('catalogue-entry-v138-style')) {
    const style = document.createElement('style');
    style.id = 'catalogue-entry-v138-style';
    style.textContent = `
#catalogue-entry-manager-v138{z-index:10060}
#catalogue-entry-manager-v138 .catalogue-admin-panel{max-width:900px}
#catalogue-entry-manager-v138 input[type=file]{padding:7px}
.catalogue-admin-actions .v138-danger{border-color:#8f1e2b!important;color:#efb5b5!important}
.catalogue-admin-actions button.v138-structure{border-color:rgba(195,162,80,.78)}
#catalogue-entry-status.error{border-color:#a94b3d;color:#e7b4aa}
`;
    document.head.appendChild(style);
  }
  const oldActions = q('catalogue-admin-save')?.closest('.catalogue-admin-actions');
  if (oldActions && !q('catalogue-entry-new')) {
    oldActions.insertAdjacentHTML('beforeend', `
<button class="v138-structure" id="catalogue-entry-new" type="button">New entry</button>
<button class="v138-structure" id="catalogue-entry-duplicate" type="button">Duplicate entry</button>
<button class="v138-structure" id="catalogue-entry-edit" type="button">Edit structure</button>
<button class="v138-danger" id="catalogue-entry-delete" type="button">Delete entry</button>`);
  }
}

let state = { version: 3, cards: {}, sections: {}, entries: {} };
let mode = 'new';
let editingKey = '';
let draftBase = null;

function setStatus(message, error = false) {
  const node = q('catalogue-entry-status');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', error);
}

async function loadState() {
  const response = await fetch(STATE_API, { cache: 'no-store', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Catalogue API returned HTTP ${response.status}`);
  const payload = await response.json();
  state = {
    version: 3,
    cards: payload?.cards && typeof payload.cards === 'object' ? payload.cards : {},
    sections: payload?.sections && typeof payload.sections === 'object' ? payload.sections : {},
    entries: payload?.entries && typeof payload.entries === 'object' ? payload.entries : {}
  };
  updateStructuralButtons();
  return state;
}

function selectedKey() {
  return q('catalogue-admin-card')?.value || '';
}

function selectedCard() {
  const key = selectedKey();
  return key ? document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`) : null;
}

function updateStructuralButtons() {
  const key = selectedKey();
  const dynamic = Boolean(key && state.entries[key]);
  if (q('catalogue-entry-edit')) q('catalogue-entry-edit').disabled = !dynamic;
  if (q('catalogue-entry-delete')) q('catalogue-entry-delete').disabled = !dynamic;
}

function setField(id, value) {
  const node = q(id);
  if (node) node.value = value ?? '';
}

function populateForm(entry, keyEditable) {
  const data = entry || {};
  setField('catalogue-entry-key', data.key || '');
  const keyField = q('catalogue-entry-key');
  keyField.readOnly = !keyEditable;
  if (keyEditable) delete keyField.dataset.userEdited;
  setField('catalogue-entry-type', data.taster ? 'taster' : 'main');
  setField('catalogue-entry-risk', data.risk || 1);
  setField('catalogue-entry-brand', data.brand || '');
  setField('catalogue-entry-title', data.title || '');
  setField('catalogue-entry-eyebrow', data.eyebrow || 'Catalogue entry');
  setField('catalogue-entry-package-price', data.packagePrice ?? data.price ?? '');
  setField('catalogue-entry-package-label', data.packageLabel || 'single cigar');
  setField('catalogue-entry-price', data.price ?? '');
  setField('catalogue-entry-country', data.country || '');
  setField('catalogue-entry-length', data.length ?? '');
  setField('catalogue-entry-ring', data.ring ?? '');
  setField('catalogue-entry-strength', data.strength ?? 5);
  setField('catalogue-entry-quality', data.quality ?? 5);
  setField('catalogue-entry-size', data.size || 'auto');
  setField('catalogue-entry-stock', data.stock || 'in');
  setField('catalogue-entry-retailers', (data.retailerLinks || []).join('\n'));
  q('catalogue-entry-image').value = '';
}

function openManager(kind) {
  const card = selectedCard();
  if (kind !== 'new' && !card) {
    alert('Select a catalogue entry first.');
    return;
  }
  mode = kind;
  editingKey = '';
  draftBase = null;

  if (kind === 'new') {
    draftBase = {
      key: '', brand: '', title: '', eyebrow: 'Catalogue entry', packagePrice: 0, packageLabel: 'single cigar', price: 0,
      length: 0, ring: 0, country: '', strength: 5, quality: 5, size: 'auto', risk: 1, stock: 'in', stockPin: '',
      rank: nextRank(false), taster: false, archived: false, archivedAt: '', experienceTags: [], summaryHtml: '', noteHtml: '',
      productionLines: [], practicalLines: [], smokeTime: '', retailerLinks: [], imageUrl: '', imageSourceKey: '', imageVersion: 0,
      priceChecked: TODAY, stockChecked: TODAY
    };
    populateForm(draftBase, true);
    q('catalogue-entry-manager-title').textContent = 'New catalogue entry';
  } else if (kind === 'duplicate') {
    const source = entryFromCard(card);
    draftBase = { ...source, key: '', title: `${source.title} Copy`, rank: nextRank(source.taster), archived: false, archivedAt: '', imageUrl: '', imageSourceKey: source.key, imageVersion: 0 };
    populateForm(draftBase, true);
    q('catalogue-entry-key').value = sanitiseKey(`${source.brand}-${source.title}-copy`);
    q('catalogue-entry-manager-title').textContent = 'Duplicate catalogue entry';
  } else {
    const key = card.dataset.key;
    const dynamic = state.entries[key];
    if (!dynamic) {
      alert('Structural editing is only needed for entries created through the dynamic manager. Existing catalogue cards still use the original editor.');
      return;
    }
    editingKey = key;
    draftBase = { ...dynamic };
    populateForm(draftBase, false);
    q('catalogue-entry-manager-title').textContent = `Edit structure · ${dynamic.brand} ${dynamic.title}`;
  }

  setStatus('Structural fields ready. The original editor remains responsible for the full catalogue metadata.');
  q('catalogue-entry-manager-v138').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeManager() {
  q('catalogue-entry-manager-v138').hidden = true;
  if (q('catalogue-admin')?.hidden !== false) document.body.style.overflow = '';
}

function parseRetailers(text) {
  const urls = [];
  for (const line of String(text || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    let url;
    try { url = new URL(line); }
    catch (_) { throw new Error(`Invalid retailer URL: ${line}`); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Retailer URL must use http/https: ${line}`);
    urls.push(url.toString());
  }
  return urls;
}

function draftFromForm() {
  const key = mode === 'edit' ? editingKey : sanitiseKey(q('catalogue-entry-key').value || `${q('catalogue-entry-brand').value}-${q('catalogue-entry-title').value}`);
  if (!key) throw new Error('Entry key is required.');
  if (mode !== 'edit' && document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`)) throw new Error(`The key "${key}" already exists.`);
  const brand = q('catalogue-entry-brand').value.trim();
  const title = q('catalogue-entry-title').value.trim();
  if (!brand || !title) throw new Error('Brand and product title are required.');
  const taster = q('catalogue-entry-type').value === 'taster';
  const length = clamp(q('catalogue-entry-length').value, 0, 20, 0);
  const ring = Math.round(clamp(q('catalogue-entry-ring').value, 0, 100, 0));
  const sizeChoice = q('catalogue-entry-size').value;
  return {
    ...(draftBase || {}),
    key,
    brand,
    title,
    eyebrow: q('catalogue-entry-eyebrow').value.trim() || 'Catalogue entry',
    packagePrice: clamp(q('catalogue-entry-package-price').value, 0, 100000, 0),
    packageLabel: q('catalogue-entry-package-label').value.trim() || 'single cigar',
    price: clamp(q('catalogue-entry-price').value, 0, 100000, 0),
    length,
    ring,
    country: q('catalogue-entry-country').value.trim() || 'Unknown',
    strength: Math.round(clamp(q('catalogue-entry-strength').value, 1, 10, 5)),
    quality: Math.round(clamp(q('catalogue-entry-quality').value, 1, 10, 5)),
    size: sizeChoice === 'auto' ? deriveSize(length, ring) : sizeChoice,
    risk: Number(q('catalogue-entry-risk').value) || 1,
    stock: q('catalogue-entry-stock').value,
    stockPin: draftBase?.stockPin || '',
    rank: mode === 'edit' ? (draftBase?.rank || nextRank(taster)) : nextRank(taster),
    taster,
    archived: mode === 'edit' ? Boolean(draftBase?.archived) : false,
    archivedAt: mode === 'edit' ? (draftBase?.archivedAt || '') : '',
    retailerLinks: parseRetailers(q('catalogue-entry-retailers').value),
    priceChecked: draftBase?.priceChecked || TODAY,
    stockChecked: draftBase?.stockChecked || TODAY
  };
}

async function putEntry(entry) {
  const response = await fetch(`${ENTRY_API}${encodeURIComponent(entry.key)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Entry save failed with HTTP ${response.status}`);
  return payload.entry || entry;
}

async function uploadImage(key, file) {
  if (!file) return null;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Image must be PNG, JPEG or WebP.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 12 MiB upload limit.');
  const response = await fetch(`${IMAGE_API}${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Image upload failed with HTTP ${response.status}`);
  return payload;
}

async function saveEntry() {
  const save = q('catalogue-entry-save');
  save.disabled = true;
  try {
    let entry = draftFromForm();
    setStatus('Saving entry structure to Cloudflare KV…');
    entry = await putEntry(entry);
    const file = q('catalogue-entry-image').files?.[0] || null;
    if (file) {
      setStatus(`Uploading original ${file.type.replace('image/', '').toUpperCase()} image without forced recompression…`);
      await uploadImage(entry.key, file);
      entry = await putEntry({
        ...entry,
        imageUrl: `${IMAGE_API}${encodeURIComponent(entry.key)}?v=${Date.now()}`,
        imageSourceKey: '',
        imageVersion: Date.now()
      });
    }
    localStorage.setItem('cigar-catalogue-v138-open-entry', entry.key);
    setStatus('Saved. Reloading into the full original catalogue editor…');
    setTimeout(() => location.reload(), 250);
  } catch (error) {
    setStatus(error.message || String(error), true);
    save.disabled = false;
  }
}

async function deleteSelected() {
  const key = selectedKey();
  const entry = state.entries[key];
  if (!entry) return;
  if (!confirm(`Delete ${entry.brand} ${entry.title}? This removes the dynamic entry, its saved override and its uploaded image.`)) return;
  const button = q('catalogue-entry-delete');
  button.disabled = true;
  try {
    const response = await fetch(`${ENTRY_API}${encodeURIComponent(key)}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Delete failed with HTTP ${response.status}`);
    location.reload();
  } catch (error) {
    alert(error.message || String(error));
    button.disabled = false;
  }
}

function restorePostReloadSelection() {
  const key = localStorage.getItem('cigar-catalogue-v138-open-entry');
  if (!key) return;
  localStorage.removeItem('cigar-catalogue-v138-open-entry');
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const toggle = q('catalogue-admin-toggle');
    const select = q('catalogue-admin-card');
    const option = select?.querySelector(`option[value="${CSS.escape(key)}"]`);
    if (toggle && select && option) {
      clearInterval(timer);
      toggle.click();
      setTimeout(() => {
        select.value = key;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, 50);
    } else if (attempts > 40) {
      clearInterval(timer);
    }
  }, 100);
}

function bind() {
  ensureUi();
  q('catalogue-entry-new')?.addEventListener('click', () => openManager('new'));
  q('catalogue-entry-duplicate')?.addEventListener('click', () => openManager('duplicate'));
  q('catalogue-entry-edit')?.addEventListener('click', () => openManager('edit'));
  q('catalogue-entry-delete')?.addEventListener('click', deleteSelected);
  q('catalogue-entry-manager-close')?.addEventListener('click', closeManager);
  q('catalogue-entry-cancel')?.addEventListener('click', closeManager);
  q('catalogue-entry-save')?.addEventListener('click', saveEntry);
  q('catalogue-entry-manager-v138')?.addEventListener('click', event => { if (event.target === q('catalogue-entry-manager-v138')) closeManager(); });
  q('catalogue-admin-card')?.addEventListener('change', updateStructuralButtons);
  q('catalogue-entry-brand')?.addEventListener('input', () => {
    if (mode === 'edit') return;
    const keyField = q('catalogue-entry-key');
    if (!keyField.dataset.userEdited) keyField.value = sanitiseKey(`${q('catalogue-entry-brand').value}-${q('catalogue-entry-title').value}`);
  });
  q('catalogue-entry-title')?.addEventListener('input', () => {
    if (mode === 'edit') return;
    const keyField = q('catalogue-entry-key');
    if (!keyField.dataset.userEdited) keyField.value = sanitiseKey(`${q('catalogue-entry-brand').value}-${q('catalogue-entry-title').value}`);
  });
  q('catalogue-entry-key')?.addEventListener('input', event => { event.currentTarget.dataset.userEdited = '1'; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && q('catalogue-entry-manager-v138')?.hidden === false) closeManager(); });
  loadState().catch(error => {
    console.error('v138 entry manager state load failed', error);
    updateStructuralButtons();
  });
  restorePostReloadSelection();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
