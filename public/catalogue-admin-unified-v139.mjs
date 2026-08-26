const QUALITY_BENCHMARKS = Object.freeze({
  1: 1.75, 2: 2.50, 3: 3.50, 4: 5, 5: 7,
  6: 10, 7: 14, 8: 18, 9: 22, 10: 26
});

export function sanitiseKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export function parseRetailerUrls(text) {
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

function clampScore(value) {
  const number = Number(value);
  return Math.max(1, Math.min(10, Math.round(Number.isFinite(number) ? number : 1)));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function deriveValue(price, quality) {
  const q = clampScore(quality);
  const benchmark = QUALITY_BENCHMARKS[q];
  const p = Math.max(0, finiteNumber(price));
  const ratio = p > 0 ? p / benchmark : NaN;
  const raw = Number.isFinite(ratio) && ratio > 0 ? 6 - 3.5 * Math.log2(ratio) : 1;
  return {
    benchmark,
    ratio,
    score: Math.max(1, Math.min(10, Math.round(raw)))
  };
}

export function mergeCardOverride(existing, patch) {
  const output = { ...(existing && typeof existing === 'object' ? existing : {}) };
  for (const [key, value] of Object.entries(patch && typeof patch === 'object' ? patch : {})) {
    if (value !== undefined) output[key] = value;
  }
  return output;
}

export function buildEditorialOverride(input) {
  const quality = clampScore(input.quality);
  const price = Math.max(0, finiteNumber(input.price));
  const archivedRank = input.archivedRank ? Math.max(1, Math.round(finiteNumber(input.archivedRank, 1))) : null;
  return {
    archived: Boolean(input.archived),
    archivedAt: input.archived ? String(input.archivedAt || '') : '',
    ...(archivedRank ? { archivedRank } : {}),
    stockPin: String(input.stockPin || 'auto'),
    rank: Math.max(1, Math.round(finiteNumber(input.rank, 1))),
    strength: clampScore(input.strength),
    quality,
    value: deriveValue(price, quality).score,
    size: ['gold', 'silver', 'bronze'].includes(input.size) ? input.size : 'bronze',
    laurel: ['auto', 'none', 'crown', 'gem'].includes(input.laurel) ? input.laurel : 'auto',
    experienceTags: String(input.experience || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean),
    eyebrow: String(input.eyebrow || '').trim(),
    summaryHtml: String(input.summaryHtml || ''),
    noteHtml: String(input.noteHtml || ''),
    productionHtml: String(input.productionHtml || ''),
    practicalHtml: String(input.practicalHtml || '')
  };
}

export function buildStructuralOverride(input) {
  const output = {
    brand: String(input.brand || '').trim(),
    title: String(input.title || '').trim(),
    packagePrice: Math.max(0, finiteNumber(input.packagePrice)),
    packageLabel: String(input.packageLabel || '').trim(),
    price: Math.max(0, finiteNumber(input.price)),
    country: String(input.country || '').trim(),
    length: Math.max(0, finiteNumber(input.length)),
    ring: Math.max(0, Math.round(finiteNumber(input.ring))),
    risk: Math.max(1, Math.min(3, Math.round(finiteNumber(input.risk, 1)))),
    taster: Boolean(input.taster),
    retailerLinks: parseRetailerUrls(input.retailerText || ''),
    smokeTime: String(input.smokeTime || '').trim()
  };
  if (input.existingImageUrl) output.imageUrl = String(input.existingImageUrl);
  return output;
}


function textLinesFromMarkup(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/[^>]+>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .split(/\r?\n/)
    .map(value => value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim())
    .filter(Boolean);
}

export function buildSavePlan({ state, key, dynamic, structural, editorial, sections }) {
  const current = state && typeof state === 'object' ? state : {};
  const cards = { ...(current.cards && typeof current.cards === 'object' ? current.cards : {}) };
  cards[key] = mergeCardOverride(cards[key], { ...structural, ...editorial });
  const statePayload = {
    version: 3,
    cards,
    sections: { ...(sections && typeof sections === 'object' ? sections : {}) }
  };
  let entryPayload = null;
  if (dynamic) {
    const prior = current.entries && current.entries[key] && typeof current.entries[key] === 'object' ? current.entries[key] : {};
    entryPayload = {
      ...prior,
      key,
      brand: structural.brand || '',
      title: structural.title || '',
      eyebrow: editorial.eyebrow || structural.eyebrow || 'Catalogue entry',
      packagePrice: finiteNumber(structural.packagePrice),
      packageLabel: structural.packageLabel || 'single cigar',
      price: finiteNumber(structural.price),
      length: finiteNumber(structural.length),
      ring: Math.max(0, Math.round(finiteNumber(structural.ring))),
      country: structural.country || 'Unknown',
      strength: clampScore(editorial.strength),
      quality: clampScore(editorial.quality),
      value: deriveValue(structural.price, editorial.quality).score,
      size: ['gold', 'silver', 'bronze'].includes(editorial.size) ? editorial.size : 'bronze',
      risk: Math.max(1, Math.min(3, Math.round(finiteNumber(structural.risk, 1)))),
      stock: prior.stock || 'unknown',
      stockPin: editorial.stockPin || prior.stockPin || '',
      rank: Math.max(1, Math.round(finiteNumber(editorial.rank, 1))),
      taster: Boolean(structural.taster),
      archived: Boolean(editorial.archived),
      archivedAt: editorial.archived ? String(editorial.archivedAt || '') : '',
      experienceTags: Array.isArray(editorial.experienceTags) ? [...editorial.experienceTags] : [],
      summaryHtml: editorial.summaryHtml || '',
      noteHtml: editorial.noteHtml || '',
      productionLines: textLinesFromMarkup(editorial.productionHtml),
      practicalLines: textLinesFromMarkup(editorial.practicalHtml),
      smokeTime: structural.smokeTime || prior.smokeTime || '',
      retailerLinks: Array.isArray(structural.retailerLinks) ? [...structural.retailerLinks] : [],
      imageUrl: structural.imageUrl || prior.imageUrl || '',
      imageSourceKey: prior.imageSourceKey || '',
      imageVersion: prior.imageVersion || 0,
      priceChecked: prior.priceChecked || '',
      stockChecked: prior.stockChecked || ''
    };
  }
  return { statePayload, entryPayload };
}

export function reorderCohortOverrides(cards, existingCards, options) {
  const key = options.key;
  const targetTaster = Boolean(options.taster);
  const wantsArchived = Boolean(options.wantsArchived);
  const targetRank = Math.max(1, Math.round(finiteNumber(options.targetRank, 1)));
  const now = String(options.now || new Date().toISOString());
  const updates = {};
  const rows = Array.isArray(cards) ? cards.map(item => ({ ...item })) : [];
  const selected = rows.find(item => item.key === key);
  if (!selected) return updates;
  const originalRank = Math.max(1, Math.round(finiteNumber(selected.rank, 1)));
  const existing = existingCards && existingCards[key] && typeof existingCards[key] === 'object' ? existingCards[key] : {};

  // Renumber the selected card's old active cohort if it is moving cohort or becoming archived.
  const oldTaster = Boolean(selected.taster);
  if (!selected.archived && (wantsArchived || oldTaster !== targetTaster)) {
    const oldCohort = rows
      .filter(item => item.key !== key && !item.archived && Boolean(item.taster) === oldTaster)
      .sort((a, b) => finiteNumber(a.rank) - finiteNumber(b.rank));
    oldCohort.forEach((item, index) => { updates[item.key] = mergeCardOverride(existingCards?.[item.key], { rank: index + 1 }); });
  }

  if (wantsArchived) {
    updates[key] = mergeCardOverride(existing, {
      archived: true,
      archivedAt: existing.archivedAt || now,
      archivedRank: existing.archivedRank || originalRank,
      taster: targetTaster
    });
    return updates;
  }

  const targetCohort = rows
    .filter(item => item.key !== key && !item.archived && Boolean(item.taster) === targetTaster)
    .sort((a, b) => finiteNumber(a.rank) - finiteNumber(b.rank));
  const insertionIndex = Math.max(0, Math.min(targetCohort.length, targetRank - 1));
  targetCohort.splice(insertionIndex, 0, { ...selected, taster: targetTaster, archived: false, key });
  targetCohort.forEach((item, index) => {
    const base = existingCards?.[item.key] || {};
    updates[item.key] = mergeCardOverride(base, {
      rank: index + 1,
      ...(item.key === key ? { archived: false, archivedAt: '', taster: targetTaster } : {})
    });
  });
  return updates;
}

export function actionFromTarget(target) {
  const button = target?.closest?.('[data-catalogue-v139-action]');
  return button?.dataset?.catalogueV139Action || '';
}


const STATE_API = '/api/catalogue-overrides';
const ENTRY_API = '/api/catalogue-entry/';
const IMAGE_API = '/api/catalogue-image/';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function q(id) { return document.getElementById(id); }
function own(object, key) { return Object.prototype.hasOwnProperty.call(object || {}, key); }
function formatAUD(value) {
  const number = Math.max(0, finiteNumber(value));
  return `A$${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(2)}`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
function numberFromText(text, fallback = 0) {
  const match = String(text || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}
function ratingNode(card, label) {
  return Array.from(card?.querySelectorAll('.rating') || []).find(node => node.querySelector(':scope > span')?.textContent.trim().toLowerCase() === label.toLowerCase()) || null;
}
function scoreFromCard(card, label, fallback = 5) {
  const match = ratingNode(card, label)?.querySelector('.subscore')?.textContent.match(/(\d+)\s*\/\s*10/);
  return match ? Number(match[1]) : fallback;
}
function tierFromCard(card, label, fallback = 'bronze') {
  const node = ratingNode(card, label);
  if (!node) return fallback;
  if (node.classList.contains('gold')) return 'gold';
  if (node.classList.contains('silver')) return 'silver';
  return 'bronze';
}
function titleFromCard(card) {
  const h3 = card?.querySelector('h3');
  if (!h3) return '';
  const clone = h3.cloneNode(true);
  clone.querySelector('span')?.remove();
  return clone.textContent.trim();
}
function experienceFromCard(card) {
  const group = Array.from(card?.querySelectorAll('.tag-group') || []).find(node => node.querySelector('.tag-label')?.textContent.trim().toLowerCase() === 'experience');
  return group ? Array.from(group.querySelectorAll('.tag-chip')).map(node => node.textContent.trim()).filter(Boolean) : [];
}
function artmetaBodyHtml(card, selector) {
  const node = card?.querySelector(selector);
  if (!node) return '';
  return Array.from(node.children).filter(child => !child.classList.contains('artmeta-title')).map(child => child.outerHTML).join('');
}
function sanitiseMarkup(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  template.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach(node => {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  });
  return template.innerHTML;
}
function deriveSize(length, ring) {
  const l = finiteNumber(length); const r = finiteNumber(ring);
  if (l >= 4 && r >= 32) return 'gold';
  if (l >= 4 && r >= 28) return 'silver';
  return 'bronze';
}
function retailerLabel(urlValue) {
  try {
    const host = new URL(urlValue).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('cigarhut.com.au')) return 'Cigarhut';
    if (host.includes('cigarworld.com.au')) return 'Cigarworld';
    if (host.includes('cigarbox.com.au')) return 'CigarBox';
    return host;
  } catch (_) { return 'retailer'; }
}
function structuralMarkup() {
  return `<div class="catalogue-admin-divider v139-only"></div>
<div class="catalogue-admin-subhead v139-only">Product &amp; purchase</div>
<div class="catalogue-admin-grid v139-only" id="catalogue-v139-structure-grid">
  <div class="catalogue-admin-field wide"><label for="catalogue-v139-key">Entry key</label><input id="catalogue-v139-key" type="text" maxlength="96"><small class="catalogue-admin-derived">Generated for new entries. Existing keys cannot be changed.</small></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-type">Catalogue type</label><select id="catalogue-v139-type"><option value="main">Recommendation</option><option value="taster">Taster</option></select></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-risk">Risk</label><select id="catalogue-v139-risk"><option value="1">Low</option><option value="2">Moderate</option><option value="3">High</option></select></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-brand">Brand</label><input id="catalogue-v139-brand" type="text"></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-title">Product / vitola title</label><input id="catalogue-v139-title" type="text"></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-package-price">Package price A$</label><input id="catalogue-v139-package-price" type="number" min="0" step="0.01"></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-package-label">Package label</label><input id="catalogue-v139-package-label" type="text" placeholder="single cigar / tin of 10"></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-price">Per-stick price A$</label><input id="catalogue-v139-price" type="number" min="0" step="0.01"></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-country">Country</label><input id="catalogue-v139-country" type="text"></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-length">Length (inches)</label><input id="catalogue-v139-length" type="number" min="0" step="0.05"></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-ring">Ring gauge</label><input id="catalogue-v139-ring" type="number" min="0" max="100" step="1"></div>
  <div class="catalogue-admin-field wide"><label for="catalogue-v139-retailers">Retailer URLs (one per line)</label><textarea id="catalogue-v139-retailers" spellcheck="false"></textarea></div>
  <div class="catalogue-admin-field"><label for="catalogue-v139-smoke-time">Smoke time</label><input id="catalogue-v139-smoke-time" type="text" placeholder="25–35 min smoke"></div>
  <div class="catalogue-admin-field wide"><label for="catalogue-v139-image">Image</label><input id="catalogue-v139-image" type="file" accept="image/png,image/jpeg,image/webp"><small class="catalogue-admin-derived" id="catalogue-v139-image-note">Leave empty to keep the current image. Original PNG/JPEG/WebP bytes are stored without forced recompression.</small></div>
</div>`;
}
function actionButtonsMarkup() {
  return `<button type="button" data-catalogue-v139-action="new">New entry</button>
<button type="button" data-catalogue-v139-action="duplicate">Duplicate entry</button>
<button type="button" data-catalogue-v139-action="delete" class="v139-danger">Delete entry</button>`;
}
function ensureUnifiedUi() {
  document.getElementById('catalogue-entry-manager-v138')?.remove();
  document.querySelectorAll('.v138-structure,.v138-danger,#catalogue-entry-new,#catalogue-entry-duplicate,#catalogue-entry-edit,#catalogue-entry-delete').forEach(node => node.remove());
  const modal = q('catalogue-admin');
  const firstGrid = modal?.querySelector('.catalogue-admin-grid');
  if (firstGrid && !q('catalogue-v139-structure-grid')) firstGrid.insertAdjacentHTML('beforebegin', structuralMarkup());
  const actions = modal?.querySelector('.catalogue-admin-actions');
  if (actions && !actions.querySelector('[data-catalogue-v139-action]')) actions.insertAdjacentHTML('afterbegin', actionButtonsMarkup());
  if (!q('catalogue-v139-style')) {
    const style = document.createElement('style');
    style.id = 'catalogue-v139-style';
    style.textContent = `.catalogue-admin-subhead{font-family:Cinzel,serif;text-transform:uppercase;letter-spacing:.12em;font-size:10px;color:#d9bc70;margin:4px 0 10px}.catalogue-admin-actions .v139-danger{border-color:#9d4a42;color:#e7b4aa}.catalogue-admin-actions .v139-danger:not(:disabled):hover{background:#6f2b28;color:#fff}.catalogue-admin-field input[type=file]{padding:7px}`;
    document.head.appendChild(style);
  }
}
function replaceOwnedButton(id) {
  const original = q(id);
  if (!original) return null;
  const replacement = original.cloneNode(true);
  original.replaceWith(replacement);
  return replacement;
}
function setStatus(message, error = false) {
  const node = q('catalogue-admin-status');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', Boolean(error));
}
function setField(id, value) { const node = q(id); if (node) node.value = value ?? ''; }
function selectedCard() {
  const key = q('catalogue-admin-card')?.value || '';
  return key && !key.startsWith('__v139_') ? document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`) : null;
}
function currentCardRows() {
  return Array.from(document.querySelectorAll('article.card[data-key]')).map(card => ({
    key: card.dataset.key,
    rank: Math.max(1, Math.round(finiteNumber(card.dataset.rank, 1))),
    taster: card.dataset.taster === '1',
    archived: card.dataset.archived === '1'
  }));
}
function existingStructureFromCard(card) {
  if (!card) return {};
  const facts = card.querySelectorAll('.facts > div');
  const art = card.querySelector('.artframe');
  const sizeText = facts[2]?.querySelector('b')?.textContent || '';
  const sizeMatch = sizeText.match(/([\d.]+)\s*″?\s*[×x]\s*(\d+)/i);
  const links = Array.from(card.querySelectorAll('a.shop[href]')).map(link => link.href).filter(Boolean);
  return {
    brand: card.querySelector('h3 span')?.textContent.trim() || '',
    title: titleFromCard(card),
    packagePrice: numberFromText(facts[0]?.querySelector('b')?.textContent, Number(card.dataset.price) || 0),
    packageLabel: facts[0]?.querySelector('small')?.textContent.trim() || 'single cigar',
    price: Number(card.dataset.price) || numberFromText(facts[1]?.querySelector('b')?.textContent),
    country: card.querySelector('.country-name')?.textContent.trim() || 'Unknown',
    length: finiteNumber(art?.dataset.visualLength, sizeMatch ? Number(sizeMatch[1]) : 0),
    ring: Math.round(finiteNumber(art?.dataset.visualRing, sizeMatch ? Number(sizeMatch[2]) : 0)),
    risk: Math.max(1, Math.min(3, Math.round(finiteNumber(card.dataset.risk, 1)))),
    taster: card.dataset.taster === '1',
    retailerLinks: links,
    smokeTime: card.querySelector('.artmeta-bottom')?.textContent.trim() || '',
    imageUrl: card.querySelector('.artframe img')?.getAttribute('src') || ''
  };
}
function effectiveStructure(card, state) {
  if (!card) return {};
  const key = card.dataset.key;
  const base = existingStructureFromCard(card);
  const dynamic = state.entries?.[key] || {};
  const override = state.cards?.[key] || {};
  return { ...base, ...dynamic, ...Object.fromEntries(Object.entries(override).filter(([name]) => ['brand','title','packagePrice','packageLabel','price','country','length','ring','risk','taster','retailerLinks','smokeTime','imageUrl'].includes(name))) };
}
function updateRiskVisual(card, risk) {
  const value = Math.max(1, Math.min(3, Math.round(finiteNumber(risk, 1))));
  card.dataset.risk = String(value);
  const badge = card.querySelector('.risk-badge');
  if (!badge) return;
  badge.classList.remove('risk-green','risk-yellow','risk-red');
  const colour = value === 1 ? 'green' : value === 2 ? 'yellow' : 'red';
  badge.classList.add(`risk-${colour}`);
  const span = badge.querySelector('span');
  if (span) span.textContent = value === 1 ? 'Low risk' : value === 2 ? 'Moderate risk' : 'High risk';
  const icon = badge.querySelector('.risk-icon');
  if (icon) { icon.className = `risk-icon ${colour}`; icon.textContent = value === 3 ? '!' : '✓'; }
}
function setRatingVisual(card, label, score) {
  const node = ratingNode(card, label);
  if (!node) return;
  const value = clampScore(score);
  const tier = value >= 7 ? 'gold' : value >= 5 ? 'silver' : 'bronze';
  node.classList.remove('gold','silver','bronze','score-high','score-mid','score-low');
  node.classList.add(tier, value >= 8 ? 'score-high' : value >= 5 ? 'score-mid' : 'score-low');
  const medal = node.querySelector('.medal');
  if (medal) { medal.classList.remove('gold','silver','bronze'); medal.classList.add(tier); }
  const bold = node.querySelector('b'); if (bold) bold.textContent = tier[0].toUpperCase() + tier.slice(1);
  const small = node.querySelector('.subscore'); if (small) small.textContent = `${value}/10`;
  if (label.toLowerCase() === 'value') card.dataset.value = String(value >= 7 ? 3 : value >= 5 ? 2 : 1);
}
function updateValueDisplay(card, price, quality, explicitScore = null) {
  const result = deriveValue(price, quality);
  setRatingVisual(card, 'Value', explicitScore ?? result.score);
  const row = card.querySelector('.value-calc');
  if (row) {
    row.classList.remove('gold','silver','bronze');
    const score = explicitScore ?? result.score;
    row.classList.add(score >= 7 ? 'gold' : score >= 5 ? 'silver' : 'bronze');
    row.innerHTML = `<span>Q${clampScore(quality)} benchmark <b>${formatAUD(result.benchmark)}</b></span><span>Actual <b>${formatAUD(price)}</b></span><span>Ratio <b>${Number.isFinite(result.ratio) ? result.ratio.toFixed(2) : '—'}×</b></span>`;
  }
}
function replaceShopLinks(card, links) {
  card.querySelectorAll('a.shop').forEach(node => node.remove());
  const body = card.querySelector('.cardbody');
  if (!body) return;
  for (const [index, url] of links.entries()) {
    const a = document.createElement('a');
    a.className = 'shop';
    a.href = url; a.rel = 'noopener'; a.target = '_blank';
    if (index) a.style.marginTop = '8px';
    a.innerHTML = `View at ${escapeHtml(retailerLabel(url))} <span>↗</span>`;
    body.appendChild(a);
  }
}
function applyStructuralOverrideToCard(card, override) {
  if (!card || !override) return;
  const h3 = card.querySelector('h3');
  if (h3 && (own(override, 'brand') || own(override, 'title'))) {
    const currentBrand = card.querySelector('h3 span')?.textContent.trim() || '';
    const currentTitle = titleFromCard(card);
    h3.innerHTML = `<span>${escapeHtml(own(override,'brand') ? override.brand : currentBrand)}</span>${escapeHtml(own(override,'title') ? override.title : currentTitle)}`;
  }
  if (own(override, 'price')) card.dataset.price = Math.max(0, finiteNumber(override.price)).toFixed(2);
  if (own(override, 'risk')) updateRiskVisual(card, override.risk);
  if (own(override, 'taster')) { if (override.taster) card.dataset.taster = '1'; else delete card.dataset.taster; }
  const country = card.querySelector('.country-name'); if (country && own(override,'country')) country.textContent = override.country || 'Unknown';
  const art = card.querySelector('.artframe');
  if (art && own(override,'length')) art.dataset.visualLength = String(override.length);
  if (art && own(override,'ring')) art.dataset.visualRing = String(override.ring);
  if (art && (own(override,'length') || own(override,'ring'))) {
    const l = finiteNumber(own(override,'length') ? override.length : art.dataset.visualLength, 1);
    const r = finiteNumber(own(override,'ring') ? override.ring : art.dataset.visualRing, 1);
    art.style.setProperty('--visual-footprint', String(Math.max(.32, Math.min(1.15, (Math.max(l,1)/5) * (Math.max(r,1)/50)))));
  }
  if (art && own(override,'imageUrl') && String(override.imageUrl || '').startsWith('/')) {
    let img = art.querySelector('img');
    if (!img) { img = document.createElement('img'); art.prepend(img); }
    img.src = override.imageUrl;
  }
  const facts = card.querySelectorAll('.facts > div');
  if (facts.length >= 3) {
    if (own(override,'packagePrice')) facts[0].querySelector('b').textContent = formatAUD(override.packagePrice);
    if (own(override,'packageLabel')) facts[0].querySelector('small').textContent = override.packageLabel || 'single cigar';
    if (own(override,'price')) facts[1].querySelector('b').textContent = formatAUD(override.price);
    if (own(override,'length') || own(override,'ring')) {
      const l = own(override,'length') ? override.length : finiteNumber(art?.dataset.visualLength);
      const r = own(override,'ring') ? override.ring : finiteNumber(art?.dataset.visualRing);
      facts[2].querySelector('b').textContent = `${l}″ × ${Math.round(r)}`;
    }
  }
  if (own(override,'retailerLinks') && Array.isArray(override.retailerLinks)) replaceShopLinks(card, override.retailerLinks);
  if (own(override,'smokeTime')) {
    let bottom = card.querySelector('.artmeta-bottom');
    if (override.smokeTime) {
      if (!bottom && art) { bottom = document.createElement('div'); bottom.className = 'artmeta artmeta-bottom'; art.appendChild(bottom); }
      if (bottom) bottom.textContent = override.smokeTime;
    } else bottom?.remove();
  }
  const quality = stateForBrowser.cards?.[card.dataset.key]?.quality ?? scoreFromCard(card, 'Quality', 5);
  const value = stateForBrowser.cards?.[card.dataset.key]?.value ?? deriveValue(card.dataset.price, quality).score;
  updateValueDisplay(card, card.dataset.price, quality, value);
}


/* V140_DYNAMIC_ENTRY_HYDRATION */
function dynamicRatingNode(card, label) {
  return Array.from(card.querySelectorAll('.rating')).find(node => {
    const span = node.querySelector(':scope > span');
    return span && span.textContent.trim().toLowerCase() === String(label).toLowerCase();
  }) || null;
}
function applyDynamicSizeVisual(card, size) {
  const tier = ['gold','silver','bronze'].includes(String(size || '').toLowerCase()) ? String(size).toLowerCase() : 'bronze';
  const node = dynamicRatingNode(card, 'Size');
  if (node) {
    node.classList.remove('gold','silver','bronze','score-low','score-mid','score-high');
    node.classList.add(tier);
    const medal = node.querySelector('.medal');
    if (medal) { medal.classList.remove('gold','silver','bronze'); medal.classList.add(tier); }
    const label = node.querySelector('b');
    if (label) label.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
    node.querySelector('.subscore')?.remove();
  }
  card.dataset.format = String(tier === 'gold' ? 3 : tier === 'silver' ? 2 : 1);
}
function applyDynamicCountryFlag(card, countryValue) {
  const name = String(countryValue || 'Unknown').trim() || 'Unknown';
  const row = card.querySelector('.country-row');
  if (!row) return;
  row.querySelectorAll('.country-flag').forEach(node => node.remove());
  const countryName = row.querySelector('.country-name');
  if (countryName) countryName.textContent = name;
  const key = name.toLowerCase();
  const map = {
    'nicaragua':'nicaragua', 'cuba':'cuba', 'honduras':'honduras', 'mexico':'mexico',
    'brazil':'brazil', 'bra':'brazil', 'dominican republic':'dominican', 'dr':'dominican',
    'usa':'usa', 'united states':'usa', 'united states of america':'usa'
  };
  const slug = map[key] || key.replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if (!slug || name === 'Unknown') return;
  const flag = document.createElement('span');
  flag.className = 'country-flag flag-' + slug;
  flag.setAttribute('aria-hidden','true');
  row.insertBefore(flag, countryName || row.firstChild);
}
function replaceDynamicArtmeta(card, selector, title, html) {
  const art = card.querySelector('.artframe');
  if (!art) return;
  let node = card.querySelector(selector);
  if (!node) {
    node = document.createElement('div');
    node.className = 'artmeta ' + selector.replace(/^\./,'');
    art.appendChild(node);
  }
  const safe = sanitiseMarkup(html || '');
  node.hidden = !safe.trim();
  node.innerHTML = '<span class="artmeta-title">' + escapeHtml(title) + '</span>' + safe;
}
function replaceDynamicExperience(card, tags) {
  let groups = card.querySelector('.tag-groups');
  const body = card.querySelector('.cardbody');
  if (!body) return;
  if (!groups) {
    groups = document.createElement('div');
    groups.className = 'tag-groups';
    const summary = card.querySelector('.summary');
    body.insertBefore(groups, summary || null);
  }
  groups.innerHTML = '';
  const clean = Array.isArray(tags) ? tags.map(v => String(v || '').trim()).filter(Boolean) : [];
  if (!clean.length) { groups.hidden = true; return; }
  groups.hidden = false;
  const group = document.createElement('div'); group.className = 'tag-group';
  const label = document.createElement('span'); label.className = 'tag-label'; label.textContent = 'Experience'; group.appendChild(label);
  const items = document.createElement('div'); items.className = 'tag-items';
  clean.forEach(value => { const chip = document.createElement('span'); chip.className = 'tag-chip'; chip.textContent = value; items.appendChild(chip); });
  group.appendChild(items); groups.appendChild(group);
}
function applyDynamicLaurel(card, saved) {
  card.querySelectorAll('.gem-award').forEach(node => node.remove());
  const medals = card.querySelector('.medals');
  if (!medals) return;
  let kind = String(saved.laurel || 'auto').toLowerCase();
  if (kind === 'none') return;
  if (kind === 'auto') {
    let golds = 0;
    if (finiteNumber(saved.strength, 0) >= 7) golds++;
    if (finiteNumber(saved.quality, 0) >= 7) golds++;
    if (String(saved.size || '').toLowerCase() === 'gold') golds++;
    if (finiteNumber(saved.value, 0) >= 7) golds++;
    kind = golds >= 4 ? 'gem' : golds >= 3 ? 'crown' : 'none';
  }
  if (!['gem','crown'].includes(kind)) return;
  const template = document.querySelector('.gem-award.' + (kind === 'gem' ? 'gem-tier' : 'crown-tier'));
  if (!template) return;
  medals.insertAdjacentElement('beforebegin', template.cloneNode(true));
}
function resetDynamicFreshness(card, saved) {
  if (card.dataset.dynamicEntry !== '1') return;
  const pin = String(saved.stockPin || 'auto').toLowerCase();
  if (pin === 'in' || pin === 'out') card.dataset.stock = pin;
  else card.dataset.stock = 'unknown';
  card.dataset.stockPin = pin;
  delete card.dataset.priceChecked;
  delete card.dataset.stockChecked;
  let row = card.querySelector('.freshness');
  const body = card.querySelector('.cardbody');
  if (!row && body) {
    row = document.createElement('div'); row.className = 'freshness';
    const medals = card.querySelector('.medals'); body.insertBefore(row, medals || null);
  }
  if (!row) return;
  row.className = 'freshness live-stock-' + (card.dataset.stock === 'in' ? 'in' : card.dataset.stock === 'out' ? 'out' : 'unknown');
  row.removeAttribute('data-checked');
  const text = card.dataset.stock === 'in' ? 'Available (manual)' : card.dataset.stock === 'out' ? 'Unavailable (manual)' : 'Stock check pending';
  row.innerHTML = '<span class="stock-state">' + escapeHtml(text) + '</span><span class="checked-state">Dynamic catalogue entry</span>';
  row.setAttribute('aria-label', text + '; Dynamic catalogue entry');
}
function applyDynamicEditorialToCard(card, saved = {}) {
  if (!card) return;
  const rank = Math.max(1, Math.round(finiteNumber(saved.rank, card.dataset.rank || 1)));
  card.dataset.rank = String(rank);
  if (saved.taster) card.dataset.taster = '1'; else delete card.dataset.taster;
  if (saved.archived) card.dataset.archived = '1'; else delete card.dataset.archived;
  if (saved.archivedAt) card.dataset.archivedAt = String(saved.archivedAt); else delete card.dataset.archivedAt;
  const rankflag = card.querySelector('.rankflag');
  if (rankflag) {
    const small = rankflag.querySelector('span'); const big = rankflag.querySelector('b');
    if (small) small.textContent = saved.archived ? 'Archived' : saved.taster ? 'T' : 'No.';
    if (big) big.textContent = String(rank);
  }
  if (saved.strength != null) setRatingVisual(card, 'Strength', saved.strength);
  if (saved.quality != null) setRatingVisual(card, 'Quality', saved.quality);
  applyDynamicSizeVisual(card, saved.size || deriveSize(saved.length, saved.ring));
  const quality = saved.quality != null ? saved.quality : scoreFromCard(card, 'Quality', 5);
  const explicitValue = saved.value != null ? saved.value : deriveValue(card.dataset.price, quality).score;
  updateValueDisplay(card, card.dataset.price, quality, explicitValue);
  const isDynamic = card.dataset.dynamicEntry === '1';
  const eyebrow = card.querySelector('.eyebrow'); if (eyebrow && (isDynamic || saved.eyebrow != null)) eyebrow.textContent = String(saved.eyebrow || '');
  const summary = card.querySelector('.summary'); if (summary && (isDynamic || saved.summaryHtml != null)) summary.innerHTML = sanitiseMarkup(saved.summaryHtml || '');
  let note = card.querySelector('.mog-note');
  const noteHtml = sanitiseMarkup(saved.noteHtml || '');
  if (noteHtml) {
    if (!note) { note = document.createElement('p'); note.className = 'mog-note'; (summary || card.querySelector('.cardbody'))?.insertAdjacentElement('afterend', note); }
    note.innerHTML = noteHtml;
  } else note?.remove();
  replaceDynamicExperience(card, saved.experienceTags);
  replaceDynamicArtmeta(card, '.artmeta-left', 'Production', saved.productionHtml || '');
  replaceDynamicArtmeta(card, '.artmeta-right', 'Practical', saved.practicalHtml || '');
  applyDynamicCountryFlag(card, saved.country || card.querySelector('.country-name')?.textContent || 'Unknown');
  applyDynamicLaurel(card, saved);
  resetDynamicFreshness(card, saved);
}
function dynamicCardHost(saved = {}) {
  if (saved.archived) return document.getElementById('archived-cards') || document.getElementById('flat-main');
  if (saved.taster) return document.getElementById('taster-cards') || document.getElementById('flat-main');
  return document.getElementById('flat-main') || document.getElementById('tier-neither') || document.querySelector('.grid');
}
function createDynamicCard(key, entry, state) {
  const template = document.querySelector('article.card[data-key="curivari-fuerte-chicos"]') ||
    document.querySelector('article.card[data-key]:not([data-taster="1"])') ||
    document.querySelector('article.card[data-key]');
  if (!template) throw new Error('Cannot hydrate dynamic catalogue entries because no card template exists.');
  const card = template.cloneNode(true);
  card.classList.remove('hidden','live-restocked');
  card.dataset.key = key;
  card.dataset.dynamicEntry = '1';
  delete card.dataset.archived;
  delete card.dataset.archivedAt;
  delete card.dataset.priceChecked;
  delete card.dataset.stockChecked;
  delete card.dataset.expected;
  delete card.dataset.ratio;
  card.querySelectorAll('.tier-badge,.parent-tier-badge,.gem-award').forEach(node => node.remove());
  const img = card.querySelector('.artframe img');
  if (img) { img.removeAttribute('data-image-source-key'); img.alt = ((entry.brand || '') + ' ' + (entry.title || key)).trim(); if (!entry.imageUrl) img.removeAttribute('src'); }
  const host = dynamicCardHost(entry);
  if (!host) throw new Error('Cannot hydrate dynamic catalogue entries because no catalogue card container exists.');
  host.appendChild(card);
  const merged = { ...entry, ...(state.cards?.[key] || {}) };
  applyStructuralOverrideToCard(card, merged);
  applyDynamicEditorialToCard(card, merged);
  return card;
}
function hydrateDynamicEntries(state) {
  let created = 0;
  for (const [key, entry] of Object.entries(state.entries || {})) {
    let card = document.querySelector('article.card[data-key="' + CSS.escape(key) + '"]');
    if (!card) { card = createDynamicCard(key, entry, state); created++; }
    else if (card.dataset.dynamicEntry === '1') applyDynamicEditorialToCard(card, { ...entry, ...(state.cards?.[key] || {}) });
  }
  return created;
}
function rebuildCardSelectFromDom(preferredValue = '') {
  const select = q('catalogue-admin-card');
  if (!select) return;
  const current = preferredValue || select.value;
  const draft = select.querySelector('option[data-v139-draft="1"]')?.cloneNode(true) || null;
  const cards = Array.from(document.querySelectorAll('article.card[data-key]')).sort((a,b) => {
    const aa = a.dataset.archived === '1' ? 2 : a.dataset.taster === '1' ? 1 : 0;
    const bb = b.dataset.archived === '1' ? 2 : b.dataset.taster === '1' ? 1 : 0;
    if (aa !== bb) return aa - bb;
    return finiteNumber(a.dataset.rank, 9999) - finiteNumber(b.dataset.rank, 9999);
  });
  select.innerHTML = '';
  if (draft) select.appendChild(draft);
  cards.forEach(card => {
    const option = document.createElement('option');
    option.value = card.dataset.key;
    const rank = Math.max(1, Math.round(finiteNumber(card.dataset.rank, 1)));
    const prefix = card.dataset.archived === '1' ? 'Archived' : card.dataset.taster === '1' ? 'T' + rank : '#' + rank;
    const brand = card.querySelector('h3 span')?.textContent.trim() || '';
    const title = titleFromCard(card);
    option.textContent = prefix + ' · ' + brand + (brand && title ? ' ' : '') + title;
    select.appendChild(option);
  });
  if (Array.from(select.options).some(option => option.value === current)) select.value = current;
  else if (draft) select.value = draft.value;
  else if (select.options.length) select.selectedIndex = 0;
}

let stateForBrowser = { version: 3, cards: {}, sections: {}, entries: {} };
let modeForBrowser = 'edit';
let draftSourceEditorial = null;
let draftSourceStructural = null;
let serverAvailableForBrowser = false;

async function loadStateForBrowser(showMessage = false) {
  try {
    const response = await fetch(STATE_API, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    stateForBrowser = {
      version: 3,
      cards: payload?.cards && typeof payload.cards === 'object' ? payload.cards : {},
      sections: payload?.sections && typeof payload.sections === 'object' ? payload.sections : {},
      entries: payload?.entries && typeof payload.entries === 'object' ? payload.entries : {}
    };
    serverAvailableForBrowser = true;
    hydrateDynamicEntries(stateForBrowser);
    for (const card of document.querySelectorAll('article.card[data-key]')) {
      const key = card.dataset.key;
      applyStructuralOverrideToCard(card, effectiveStructure(card, stateForBrowser));
      if (card.dataset.dynamicEntry === '1' && stateForBrowser.entries?.[key]) applyDynamicEditorialToCard(card, { ...stateForBrowser.entries[key], ...(stateForBrowser.cards?.[key] || {}) });
    }
    if (typeof window.catalogueRefreshCardCollections === 'function') window.catalogueRefreshCardCollections();
    else if (typeof window.reorder === 'function') window.reorder();
    rebuildCardSelectFromDom();
    if (showMessage) setStatus(`Reloaded ${Object.keys(stateForBrowser.cards).length} saved card overrides and ${Object.keys(stateForBrowser.entries).length} dynamic entries from Cloudflare KV.`);
    return stateForBrowser;
  } catch (error) {
    serverAvailableForBrowser = false;
    if (showMessage) setStatus(`Could not load saved catalogue state: ${error.message}`, true);
    return stateForBrowser;
  }
}
function populateStructuralFields() {
  if (modeForBrowser !== 'edit') return;
  const card = selectedCard();
  if (!card) return;
  const data = effectiveStructure(card, stateForBrowser);
  setField('catalogue-v139-key', card.dataset.key);
  q('catalogue-v139-key').readOnly = true;
  setField('catalogue-v139-type', data.taster ? 'taster' : 'main');
  setField('catalogue-v139-risk', data.risk || 1);
  setField('catalogue-v139-brand', data.brand || '');
  setField('catalogue-v139-title', data.title || '');
  setField('catalogue-v139-package-price', data.packagePrice ?? data.price ?? 0);
  setField('catalogue-v139-package-label', data.packageLabel || 'single cigar');
  setField('catalogue-v139-price', data.price ?? 0);
  setField('catalogue-v139-country', data.country || 'Unknown');
  setField('catalogue-v139-length', data.length ?? 0);
  setField('catalogue-v139-ring', data.ring ?? 0);
  setField('catalogue-v139-retailers', Array.isArray(data.retailerLinks) ? data.retailerLinks.join('\n') : '');
  setField('catalogue-v139-smoke-time', data.smokeTime || '');
  q('catalogue-v139-image').value = '';
  q('catalogue-v139-image-note').textContent = data.imageUrl ? 'Leave empty to keep the current image.' : 'No stored replacement image. Choose PNG/JPEG/WebP to upload one.';
  updateActionState();
  previewValueFromUnifiedFields();
}
function populateEditorialDraft(values = {}) {
  setField('catalogue-admin-section', values.archived ? 'archived' : 'active');
  setField('catalogue-admin-stock', values.stockPin || 'auto');
  setField('catalogue-admin-rank', values.rank || 1);
  setField('catalogue-admin-strength', values.strength || 5);
  setField('catalogue-admin-quality', values.quality || 5);
  setField('catalogue-admin-size', values.size || 'bronze');
  setField('catalogue-admin-laurel', values.laurel || 'auto');
  setField('catalogue-admin-experience', Array.isArray(values.experienceTags) ? values.experienceTags.join('\n') : '');
  setField('catalogue-admin-eyebrow', values.eyebrow || '');
  setField('catalogue-admin-summary', values.summaryHtml || '');
  setField('catalogue-admin-note', values.noteHtml || '');
  setField('catalogue-admin-production', values.productionHtml || '');
  setField('catalogue-admin-practical', values.practicalHtml || '');
}
function currentEditorialFromDom(card = selectedCard()) {
  if (!card) return {};
  const saved = stateForBrowser.cards?.[card.dataset.key] || {};
  return {
    archived: card.dataset.archived === '1',
    archivedAt: card.dataset.archivedAt || saved.archivedAt || '',
    archivedRank: saved.archivedRank || null,
    stockPin: saved.stockPin ?? card.dataset.stockPin ?? 'auto',
    rank: Number(card.dataset.rank) || 1,
    strength: saved.strength ?? scoreFromCard(card, 'Strength', 5),
    quality: saved.quality ?? scoreFromCard(card, 'Quality', 5),
    value: saved.value ?? scoreFromCard(card, 'Value', 5),
    size: saved.size ?? tierFromCard(card, 'Size', 'bronze'),
    laurel: saved.laurel || 'auto',
    experienceTags: Array.isArray(saved.experienceTags) ? saved.experienceTags : experienceFromCard(card),
    eyebrow: saved.eyebrow ?? (card.querySelector('.eyebrow')?.textContent.replace(/^(?:T\d+|Taster|No\.\s*\d+|Archived)\s*[—–-]\s*/, '') || ''),
    summaryHtml: saved.summaryHtml ?? card.querySelector('.summary')?.innerHTML ?? '',
    noteHtml: saved.noteHtml ?? card.querySelector('.mog-note')?.innerHTML ?? '',
    productionHtml: saved.productionHtml ?? artmetaBodyHtml(card, '.artmeta-left'),
    practicalHtml: saved.practicalHtml ?? artmetaBodyHtml(card, '.artmeta-right')
  };
}
function structuralFromFields(existingImageUrl = '') {
  return buildStructuralOverride({
    brand: q('catalogue-v139-brand').value,
    title: q('catalogue-v139-title').value,
    packagePrice: q('catalogue-v139-package-price').value,
    packageLabel: q('catalogue-v139-package-label').value,
    price: q('catalogue-v139-price').value,
    country: q('catalogue-v139-country').value,
    length: q('catalogue-v139-length').value,
    ring: q('catalogue-v139-ring').value,
    risk: q('catalogue-v139-risk').value,
    taster: q('catalogue-v139-type').value === 'taster',
    retailerText: q('catalogue-v139-retailers').value,
    smokeTime: q('catalogue-v139-smoke-time').value,
    existingImageUrl
  });
}
function editorialFromFields({ archivedAt = '', archivedRank = null, rank = null } = {}) {
  return buildEditorialOverride({
    archived: q('catalogue-admin-section').value === 'archived',
    archivedAt,
    archivedRank,
    stockPin: q('catalogue-admin-stock').value,
    rank: rank ?? q('catalogue-admin-rank').value,
    strength: q('catalogue-admin-strength').value,
    quality: q('catalogue-admin-quality').value,
    price: q('catalogue-v139-price').value,
    size: q('catalogue-admin-size').value,
    laurel: q('catalogue-admin-laurel').value,
    experience: q('catalogue-admin-experience').value,
    eyebrow: q('catalogue-admin-eyebrow').value,
    summaryHtml: sanitiseMarkup(q('catalogue-admin-summary').value),
    noteHtml: sanitiseMarkup(q('catalogue-admin-note').value),
    productionHtml: sanitiseMarkup(q('catalogue-admin-production').value),
    practicalHtml: sanitiseMarkup(q('catalogue-admin-practical').value)
  });
}
function sectionsFromFields() {
  return {
    legendHtml: sanitiseMarkup(q('catalogue-admin-legend')?.value || stateForBrowser.sections.legendHtml || ''),
    benchmarksHtml: sanitiseMarkup(q('catalogue-admin-benchmarks')?.value || stateForBrowser.sections.benchmarksHtml || '')
  };
}
function previewValueFromUnifiedFields() {
  const price = Math.max(0, finiteNumber(q('catalogue-v139-price')?.value));
  const quality = clampScore(q('catalogue-admin-quality')?.value || 1);
  const result = deriveValue(price, quality);
  if (q('catalogue-admin-value')) q('catalogue-admin-value').value = result.score;
  if (q('catalogue-admin-value-detail')) q('catalogue-admin-value-detail').textContent = `Q${quality} benchmark ${formatAUD(result.benchmark)} · ${formatAUD(price)} ÷ ${formatAUD(result.benchmark)} = ${Number.isFinite(result.ratio) ? result.ratio.toFixed(2) : '—'}×`;
}
function removeDraftOption() { q('catalogue-admin-card')?.querySelector('option[data-v139-draft="1"]')?.remove(); }
function addDraftOption(label) {
  const select = q('catalogue-admin-card'); if (!select) return;
  removeDraftOption();
  const option = document.createElement('option'); option.value = '__v139_draft__'; option.dataset.v139Draft = '1'; option.textContent = label;
  select.prepend(option); select.value = option.value;
}
function nextRankFor(taster) {
  return currentCardRows().filter(row => !row.archived && row.taster === Boolean(taster)).reduce((max, row) => Math.max(max, row.rank), 0) + 1;
}
function beginNew(duplicate = false) {
  const card = selectedCard();
  const sourceStructure = duplicate && card ? effectiveStructure(card, stateForBrowser) : null;
  const sourceEditorial = duplicate && card ? currentEditorialFromDom(card) : null;
  modeForBrowser = duplicate ? 'duplicate' : 'new';
  draftSourceStructural = sourceStructure;
  draftSourceEditorial = sourceEditorial;
  addDraftOption(duplicate ? 'New · duplicate draft' : 'New · blank entry');
  const structural = sourceStructure ? { ...sourceStructure, title: `${sourceStructure.title} Copy`, imageUrl: '' } : {
    brand:'', title:'', packagePrice:0, packageLabel:'single cigar', price:0, country:'', length:0, ring:0, risk:1, taster:false, retailerLinks:[], smokeTime:'', imageUrl:''
  };
  const editorial = sourceEditorial ? { ...sourceEditorial, archived:false, archivedAt:'', archivedRank:null, rank:nextRankFor(Boolean(structural.taster)) } : {
    archived:false, stockPin:'auto', rank:nextRankFor(false), strength:5, quality:5, size:'bronze', laurel:'auto', experienceTags:[], eyebrow:'', summaryHtml:'', noteHtml:'', productionHtml:'', practicalHtml:''
  };
  setField('catalogue-v139-key', duplicate ? sanitiseKey(`${structural.brand}-${structural.title}`) : ''); q('catalogue-v139-key').readOnly = false;
  setField('catalogue-v139-type', structural.taster ? 'taster':'main'); setField('catalogue-v139-risk', structural.risk || 1); setField('catalogue-v139-brand', structural.brand || ''); setField('catalogue-v139-title', structural.title || '');
  setField('catalogue-v139-package-price', structural.packagePrice || 0); setField('catalogue-v139-package-label', structural.packageLabel || 'single cigar'); setField('catalogue-v139-price', structural.price || 0); setField('catalogue-v139-country', structural.country || '');
  setField('catalogue-v139-length', structural.length || 0); setField('catalogue-v139-ring', structural.ring || 0); setField('catalogue-v139-retailers', Array.isArray(structural.retailerLinks) ? structural.retailerLinks.join('\n') : ''); setField('catalogue-v139-smoke-time', structural.smokeTime || '');
  q('catalogue-v139-image').value = ''; q('catalogue-v139-image-note').textContent = duplicate ? 'Choose an image for the copy. The source image is not duplicated automatically.' : 'Choose PNG/JPEG/WebP now or add one later.';
  populateEditorialDraft(editorial); previewValueFromUnifiedFields(); updateActionState();
  setStatus(duplicate ? 'Duplicate draft ready. Edit anything, then Save to site.' : 'New entry draft ready. Fill the fields, then Save to site.');
}
function updateActionState() {
  const deleteButton = q('catalogue-admin')?.querySelector('[data-catalogue-v139-action="delete"]');
  const duplicateButton = q('catalogue-admin')?.querySelector('[data-catalogue-v139-action="duplicate"]');
  const key = selectedCard()?.dataset.key || '';
  const dynamic = Boolean(key && stateForBrowser.entries?.[key]);
  if (deleteButton) deleteButton.disabled = modeForBrowser !== 'edit' || !dynamic;
  if (duplicateButton) duplicateButton.disabled = modeForBrowser !== 'edit' || !key;
}
async function uploadImage(key, file) {
  if (!file) return null;
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error('Image must be PNG, JPEG or WebP.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 12 MiB upload limit.');
  const response = await fetch(`${IMAGE_API}${encodeURIComponent(key)}`, { method:'PUT', headers:{'content-type':file.type}, body:file });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Image upload failed with HTTP ${response.status}`);
  return payload;
}
async function putEntry(key, entry) {
  const response = await fetch(`${ENTRY_API}${encodeURIComponent(key)}`, { method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify(entry) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Entry save failed with HTTP ${response.status}`);
  return payload.entry || entry;
}
async function putState(payload) {
  const response = await fetch(STATE_API, { method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Catalogue save failed with HTTP ${response.status}`);
  return data;
}
async function saveUnified() {
  const saveButton = q('catalogue-admin-save'); const reloadButton = q('catalogue-admin-reload');
  saveButton.disabled = true; reloadButton.disabled = true;
  try {
    let key = modeForBrowser === 'edit' ? selectedCard()?.dataset.key || '' : sanitiseKey(q('catalogue-v139-key').value || `${q('catalogue-v139-brand').value}-${q('catalogue-v139-title').value}`);
    if (!key) throw new Error('Entry key is required.');
    if (modeForBrowser !== 'edit' && (document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`) || stateForBrowser.entries?.[key])) throw new Error(`The entry key "${key}" already exists.`);
    let structural = structuralFromFields(modeForBrowser === 'edit' ? (stateForBrowser.cards?.[key]?.imageUrl || stateForBrowser.entries?.[key]?.imageUrl || '') : '');
    if (!structural.brand || !structural.title) throw new Error('Brand and product title are required.');
    const wantsArchived = q('catalogue-admin-section').value === 'archived';
    const selected = selectedCard();
    const priorSaved = stateForBrowser.cards?.[key] || {};
    const priorArchivedAt = selected?.dataset.archivedAt || priorSaved.archivedAt || '';
    const priorArchivedRank = priorSaved.archivedRank || (selected?.dataset.archived === '1' ? Number(q('catalogue-admin-rank').value) : null);
    let rows = currentCardRows();
    if (modeForBrowser !== 'edit') rows = [...rows, { key, rank: nextRankFor(structural.taster), taster: structural.taster, archived:false }];
    const rankUpdates = reorderCohortOverrides(rows, stateForBrowser.cards, {
      key, taster: structural.taster, wantsArchived, targetRank: q('catalogue-admin-rank').value, now:new Date().toISOString()
    });
    const cardsWithRanks = { ...stateForBrowser.cards, ...rankUpdates };
    const rankState = rankUpdates[key] || {};
    let editorial = editorialFromFields({
      archivedAt: wantsArchived ? (rankState.archivedAt || priorArchivedAt || new Date().toISOString()) : '',
      archivedRank: wantsArchived ? (rankState.archivedRank || priorArchivedRank || Number(q('catalogue-admin-rank').value) || 1) : priorArchivedRank,
      rank: rankState.rank || q('catalogue-admin-rank').value
    });
    editorial = { ...editorial, ...(rankState.archived !== undefined ? {archived:rankState.archived} : {}), ...(rankState.archivedAt !== undefined ? {archivedAt:rankState.archivedAt} : {}), ...(rankState.archivedRank !== undefined ? {archivedRank:rankState.archivedRank} : {}) };
    const file = q('catalogue-v139-image').files?.[0] || null;
    const dynamic = modeForBrowser !== 'edit' || Boolean(stateForBrowser.entries?.[key]);
    let plan = buildSavePlan({ state:{...stateForBrowser,cards:cardsWithRanks}, key, dynamic, structural, editorial, sections:sectionsFromFields() });

    if (dynamic) {
      setStatus('Saving entry to Cloudflare KV…');
      await putEntry(key, plan.entryPayload);
    }
    if (file) {
      setStatus(`Uploading original ${file.type.replace('image/','').toUpperCase()} image…`);
      await uploadImage(key, file);
      structural = { ...structural, imageUrl:`${IMAGE_API}${encodeURIComponent(key)}?v=${Date.now()}` };
      plan = buildSavePlan({ state:{...stateForBrowser,cards:cardsWithRanks}, key, dynamic, structural, editorial, sections:sectionsFromFields() });
      if (dynamic) await putEntry(key, plan.entryPayload);
    }
    setStatus('Saving catalogue fields and sections to Cloudflare KV…');
    await putState(plan.statePayload);
    setStatus('Saved site-wide. Reloading…');
    setTimeout(() => location.reload(), 250);
  } catch (error) {
    setStatus(`Save failed: ${error.message || error}`, true);
    saveButton.disabled = false; reloadButton.disabled = false;
  }
}
async function deleteDynamic() {
  const card = selectedCard(); const key = card?.dataset.key || '';
  const entry = stateForBrowser.entries?.[key];
  if (!entry) { setStatus('Only entries created through New entry can be deleted. Archive legacy catalogue cards instead.', true); return; }
  if (!confirm(`Delete ${entry.brand || ''} ${entry.title || key}? This also deletes its uploaded KV image.`)) return;
  const button = q('catalogue-admin')?.querySelector('[data-catalogue-v139-action="delete"]'); if (button) button.disabled = true;
  try {
    const response = await fetch(`${ENTRY_API}${encodeURIComponent(key)}`, { method:'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Delete failed with HTTP ${response.status}`);
    location.reload();
  } catch (error) { setStatus(`Delete failed: ${error.message || error}`, true); if (button) button.disabled = false; }
}
function onAdminAction(event) {
  const action = actionFromTarget(event.target); if (!action) return;
  event.preventDefault();
  if (action === 'new') beginNew(false);
  else if (action === 'duplicate') beginNew(true);
  else if (action === 'delete') deleteDynamic();
}
function onCardSelectionChanged() {
  const select = q('catalogue-admin-card');
  if (!select || select.value.startsWith('__v139_')) return;
  modeForBrowser = 'edit'; draftSourceEditorial = null; draftSourceStructural = null; removeDraftOption();
  setTimeout(populateStructuralFields, 0);
}
function onTypeChanged() {
  if (modeForBrowser === 'new' || modeForBrowser === 'duplicate') setField('catalogue-admin-rank', nextRankFor(q('catalogue-v139-type').value === 'taster'));
}
export function initUnifiedAdmin() {
  ensureUnifiedUi();
  const save = replaceOwnedButton('catalogue-admin-save');
  const reload = replaceOwnedButton('catalogue-admin-reload');
  save?.addEventListener('click', saveUnified);
  reload?.addEventListener('click', () => location.reload());
  q('catalogue-admin')?.addEventListener('click', onAdminAction);
  q('catalogue-admin-card')?.addEventListener('change', onCardSelectionChanged);
  q('catalogue-v139-price')?.addEventListener('input', previewValueFromUnifiedFields);
  q('catalogue-admin-quality')?.addEventListener('input', () => setTimeout(previewValueFromUnifiedFields, 0));
  q('catalogue-v139-type')?.addEventListener('change', onTypeChanged);
  for (const id of ['catalogue-v139-length','catalogue-v139-ring']) q(id)?.addEventListener('change', () => {
    if (modeForBrowser !== 'edit') setField('catalogue-admin-size', deriveSize(q('catalogue-v139-length').value, q('catalogue-v139-ring').value));
  });
  q('catalogue-admin-toggle')?.addEventListener('click', () => setTimeout(() => { if (modeForBrowser === 'edit') populateStructuralFields(); }, 0));
  loadStateForBrowser(false).then(() => { if (modeForBrowser === 'edit') populateStructuralFields(); });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUnifiedAdmin, { once:true });
  else initUnifiedAdmin();
}
