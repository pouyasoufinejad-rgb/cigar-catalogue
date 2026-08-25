import legacyWorker from './legacy-v136-worker.js';

export const STATE_KEY = 'catalogue-overrides';
export const IMAGE_PREFIX = 'catalogue-image:';
export const IMAGE_META_PREFIX = 'catalogue-image-meta:';
export const MAX_STATE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

export const QUALITY_BENCHMARKS = Object.freeze({
  1: 1.75, 2: 2.50, 3: 3.50, 4: 5, 5: 7,
  6: 10, 7: 14, 8: 18, 9: 22, 10: 26
});

const DEFAULT_ENTRIES = Object.freeze({
  'tatiana-dolce-vanilla': {
    key: 'tatiana-dolce-vanilla',
    brand: 'Tatiana',
    title: 'Dolce Vanilla — Single',
    eyebrow: 'Low-commitment dedicated vanilla test',
    packagePrice: 22,
    packageLabel: 'single cigar',
    price: 22,
    length: 4.8,
    ring: 30,
    country: 'Dominican Republic',
    strength: 4,
    quality: 6,
    size: 'silver',
    risk: 1,
    stock: 'in',
    stockPin: '',
    rank: 29,
    taster: false,
    archived: false,
    archivedAt: '',
    experienceTags: [
      'Nicotine: Low',
      'Pairings: Coffee, wafer, Biscoff',
      'Occasion: Dessert smoke, vanilla test, after dinner'
    ],
    summaryHtml: '<strong>Sweet vanilla, cream, toasted sugar, cocoa and light cedar</strong> make this a direct vanilla test with more tobacco presence than a mini. Mild spice keeps the sweetness from becoming completely flat, while the slim 30-ring format keeps the smoke fairly brisk.',
    noteHtml: '',
    productionLines: ['Flavoured', 'Handmade', 'Indonesian wrapper; Dominican binder and filler.'],
    practicalLines: ['Single cigar', 'Uncut', 'Cellophane protected', 'Lenient Cadence'],
    smokeTime: '25–35 min smoke',
    retailerLinks: ['https://www.cigarhut.com.au/tatiana-dolce-vanilla/'],
    imageUrl: '/tatiana-dolce.png',
    imageSourceKey: '',
    imageVersion: 0,
    priceChecked: '2026-08-25',
    stockChecked: '2026-08-25'
  },
  'tatiana-mini-vanilla': {
    key: 'tatiana-mini-vanilla',
    brand: 'Tatiana',
    title: 'Mini Vanilla — Tin of 10',
    eyebrow: 'Cheapest dedicated vanilla smoke',
    packagePrice: 88,
    packageLabel: 'tin of 10',
    price: 8.8,
    length: 3.5,
    ring: 26,
    country: 'Dominican Republic',
    strength: 3,
    quality: 5,
    size: 'bronze',
    risk: 2,
    stock: 'in',
    stockPin: '',
    rank: 30,
    taster: false,
    archived: false,
    archivedAt: '',
    experienceTags: [
      'Nicotine: Low',
      'Pairings: Coffee, vanilla dessert, cola',
      'Occasion: Quick dessert smoke, pocket option'
    ],
    summaryHtml: '<strong>Vanilla cream, cocoa and light cedar</strong> lead a short, direct dessert profile. The 26-ring format is quick and convenient but more heat-sensitive than the Dolce, so it rewards a slower cadence.',
    noteHtml: '',
    productionLines: ['Flavoured', 'Machine-made', 'Dominican tobacco.'],
    practicalLines: ['Tin of 10', 'Ready to smoke', 'Tin protected', 'Sensitive Cadence'],
    smokeTime: '15–20 min smoke',
    retailerLinks: ['https://www.cigarhut.com.au/tatiana-mini-vanilla/'],
    imageUrl: '/tatiana-mini.png',
    imageSourceKey: '',
    imageVersion: 0,
    priceChecked: '2026-08-25',
    stockChecked: '2026-08-25'
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function defaultEntries() {
  return clone(DEFAULT_ENTRIES);
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function record(value) {
  return isRecord(value) ? value : {};
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 1, min = 1, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(max, Math.round(finite(value, fallback))));
}

function score(value, fallback = 5) {
  return integer(value, fallback, 1, 10);
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function stringList(value) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.toString() : '';
  } catch (_) {
    return '';
  }
}

function normaliseLinks(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (typeof item === 'string') return safeHttpUrl(item);
    if (isRecord(item)) return safeHttpUrl(item.url);
    return '';
  }).filter(Boolean);
}

export function sanitiseKey(value) {
  const decoded = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(decoded) ? decoded : '';
}

export function deriveSize(length, ring) {
  const l = finite(length);
  const r = finite(ring);
  if (l >= 4 && r >= 32) return 'gold';
  if (l >= 4 && r >= 28) return 'silver';
  return 'bronze';
}

export function deriveValue(price, quality) {
  const q = score(quality);
  const benchmark = QUALITY_BENCHMARKS[q];
  const p = finite(price);
  const ratio = p > 0 ? p / benchmark : NaN;
  const raw = Number.isFinite(ratio) && ratio > 0 ? 6 - 3.5 * Math.log2(ratio) : 1;
  return {
    benchmark,
    ratio,
    score: Math.max(1, Math.min(10, Math.round(raw)))
  };
}

export function scoreBucket(value) {
  const n = score(value);
  return n >= 7 ? 3 : n >= 5 ? 2 : 1;
}

export function sizeBucket(value) {
  return value === 'gold' ? 3 : value === 'silver' ? 2 : 1;
}

export function normaliseEntry(input, keyOverride = '') {
  const raw = isRecord(input) ? input : {};
  const key = sanitiseKey(keyOverride || raw.key);
  const length = Math.max(0, finite(raw.length));
  const ring = Math.max(0, integer(raw.ring, 0, 0, 100));
  const quality = score(raw.quality, 5);
  const price = Math.max(0, finite(raw.price));
  const size = ['gold', 'silver', 'bronze'].includes(raw.size) ? raw.size : deriveSize(length, ring);
  const value = deriveValue(price, quality).score;
  const stock = ['in', 'out', 'unknown'].includes(raw.stock) ? raw.stock : 'unknown';
  const stockPin = ['in', 'out', 'hold'].includes(raw.stockPin) ? raw.stockPin : '';
  const imageUrl = text(raw.imageUrl).startsWith('/') ? text(raw.imageUrl) : '';
  return {
    key,
    brand: text(raw.brand).trim(),
    title: text(raw.title).trim(),
    eyebrow: text(raw.eyebrow, 'Catalogue entry').trim(),
    packagePrice: Math.max(0, finite(raw.packagePrice, price)),
    packageLabel: text(raw.packageLabel, 'single cigar').trim(),
    price,
    length,
    ring,
    country: text(raw.country, 'Unknown').trim(),
    strength: score(raw.strength, 5),
    quality,
    value,
    size,
    risk: integer(raw.risk, 1, 1, 3),
    stock,
    stockPin,
    rank: integer(raw.rank, 1, 1, 999),
    taster: Boolean(raw.taster),
    archived: Boolean(raw.archived),
    archivedAt: text(raw.archivedAt),
    experienceTags: stringList(raw.experienceTags),
    summaryHtml: text(raw.summaryHtml),
    noteHtml: text(raw.noteHtml),
    productionLines: stringList(raw.productionLines),
    practicalLines: stringList(raw.practicalLines),
    smokeTime: text(raw.smokeTime),
    retailerLinks: normaliseLinks(raw.retailerLinks),
    imageUrl,
    imageSourceKey: sanitiseKey(raw.imageSourceKey),
    imageVersion: integer(raw.imageVersion, 0, 0, Number.MAX_SAFE_INTEGER),
    priceChecked: /^\d{4}-\d{2}-\d{2}$/.test(text(raw.priceChecked)) ? raw.priceChecked : '',
    stockChecked: /^\d{4}-\d{2}-\d{2}$/.test(text(raw.stockChecked)) ? raw.stockChecked : ''
  };
}

function normaliseEntries(value) {
  if (!isRecord(value)) return {};
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    const safe = sanitiseKey(key);
    if (!safe) continue;
    const entry = normaliseEntry(raw, safe);
    if (!entry.key) continue;
    output[safe] = entry;
  }
  return output;
}

export function normaliseState(input) {
  const raw = isRecord(input) ? input : {};
  const rawEntries = own(raw, 'entries') && isRecord(raw.entries) ? raw.entries : null;
  const values = rawEntries ? Object.values(rawEntries) : [];
  const legacyHtmlEntries = values.length > 0 && values.every(entry => isRecord(entry) && typeof entry.html === 'string' && !entry.brand && !entry.title);
  const entries = rawEntries ? (legacyHtmlEntries ? defaultEntries() : normaliseEntries(rawEntries)) : defaultEntries();
  return {
    version: 3,
    updatedAt: text(raw.updatedAt),
    cards: record(raw.cards),
    sections: record(raw.sections),
    entries
  };
}

export function mergeState(existingInput, incomingInput) {
  const existing = normaliseState(existingInput);
  const incoming = isRecord(incomingInput) ? incomingInput : {};
  return {
    version: 3,
    updatedAt: new Date().toISOString(),
    cards: own(incoming, 'cards') ? record(incoming.cards) : existing.cards,
    sections: own(incoming, 'sections') ? record(incoming.sections) : existing.sections,
    entries: own(incoming, 'entries') ? normaliseEntries(incoming.entries) : existing.entries
  };
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function readRawState(env) {
  if (!env?.CATALOGUE_STATE) return null;
  try {
    const textValue = await env.CATALOGUE_STATE.get(STATE_KEY);
    return textValue ? JSON.parse(textValue) : null;
  } catch (_) {
    return null;
  }
}

export async function readState(env) {
  return normaliseState(await readRawState(env));
}

async function writeState(env, state) {
  await env.CATALOGUE_STATE.put(STATE_KEY, JSON.stringify(state));
}

export async function handleState(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const response = json(await readState(env));
    return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD, PUT' } });
  }
  if (!env?.CATALOGUE_STATE) return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_STATE_BYTES) return json({ error: 'Catalogue state is too large.' }, { status: 413 });
  let parsed;
  try { parsed = JSON.parse(body); }
  catch (_) { return json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const existing = await readRawState(env);
  const merged = mergeState(existing, parsed);
  await writeState(env, merged);
  return json({
    ok: true,
    version: 3,
    cards: Object.keys(merged.cards).length,
    sections: Object.keys(merged.sections).length,
    entries: Object.keys(merged.entries).length,
    updatedAt: merged.updatedAt
  });
}

export async function handleEntry(request, env, rawKey) {
  const key = sanitiseKey(decodeURIComponent(String(rawKey || '')));
  if (!key) return json({ error: 'Invalid entry key.' }, { status: 400 });
  if (!env?.CATALOGUE_STATE) return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });

  const state = await readState(env);
  if (request.method === 'GET' || request.method === 'HEAD') {
    const entry = state.entries[key];
    if (!entry) return json({ error: 'Entry not found.' }, { status: 404 });
    const response = json(entry);
    return request.method === 'HEAD' ? new Response(null, { status: 200, headers: response.headers }) : response;
  }

  if (request.method === 'PUT') {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 256 * 1024) return json({ error: 'Entry payload is too large.' }, { status: 413 });
    let parsed;
    try { parsed = JSON.parse(body); }
    catch (_) { return json({ error: 'Invalid JSON.' }, { status: 400 }); }
    const entry = normaliseEntry(parsed, key);
    if (!entry.brand || !entry.title) return json({ error: 'Brand and title are required.' }, { status: 400 });
    state.entries[key] = entry;
    state.version = 3;
    state.updatedAt = new Date().toISOString();
    await writeState(env, state);
    return json({ ok: true, entry });
  }

  if (request.method === 'DELETE') {
    if (!state.entries[key]) return json({ error: 'Entry not found.' }, { status: 404 });
    delete state.entries[key];
    delete state.cards[key];
    state.version = 3;
    state.updatedAt = new Date().toISOString();
    await writeState(env, state);
    await Promise.all([
      env.CATALOGUE_STATE.delete(`${IMAGE_PREFIX}${key}`),
      env.CATALOGUE_STATE.delete(`${IMAGE_META_PREFIX}${key}`)
    ]);
    return json({ ok: true, key });
  }

  return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD, PUT, DELETE' } });
}

export async function handleImage(request, env, rawKey) {
  const key = sanitiseKey(decodeURIComponent(String(rawKey || '')));
  if (!key) return json({ error: 'Invalid image key.' }, { status: 400 });
  if (!env?.CATALOGUE_STATE) return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });
  const imageKey = `${IMAGE_PREFIX}${key}`;
  const metaKey = `${IMAGE_META_PREFIX}${key}`;

  if (request.method === 'GET' || request.method === 'HEAD') {
    const data = await env.CATALOGUE_STATE.get(imageKey, 'arrayBuffer');
    if (!data) return new Response('Not found', { status: 404 });
    const contentType = (await env.CATALOGUE_STATE.get(metaKey)) || 'image/png';
    return new Response(request.method === 'HEAD' ? null : data, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=300, must-revalidate',
        'x-content-type-options': 'nosniff'
      }
    });
  }

  if (request.method === 'PUT') {
    const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) return json({ error: 'Only PNG, JPEG and WebP images are accepted.' }, { status: 415 });
    const data = await request.arrayBuffer();
    if (!data.byteLength) return json({ error: 'Image is empty.' }, { status: 400 });
    if (data.byteLength > MAX_IMAGE_BYTES) return json({ error: 'Image exceeds the 12 MiB upload limit.' }, { status: 413 });
    await env.CATALOGUE_STATE.put(imageKey, data);
    await env.CATALOGUE_STATE.put(metaKey, contentType);
    return json({ ok: true, key, bytes: data.byteLength, contentType });
  }

  if (request.method === 'DELETE') {
    await Promise.all([env.CATALOGUE_STATE.delete(imageKey), env.CATALOGUE_STATE.delete(metaKey)]);
    return json({ ok: true, key });
  }

  return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD, PUT, DELETE' } });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function aud(value) {
  const number = finite(value);
  return `A$${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(2)}`;
}

function tierName(scoreValue) {
  const bucket = scoreBucket(scoreValue);
  return bucket === 3 ? 'gold' : bucket === 2 ? 'silver' : 'bronze';
}

function medalRating(label, scoreValue) {
  const value = score(scoreValue);
  const tier = tierName(value);
  const className = value >= 8 ? 'score-high' : value >= 5 ? 'score-mid' : 'score-low';
  return `<div class="rating ${tier} ${className}"><span>${esc(label)}</span><i aria-hidden="true" class="medal ${tier}"></i><b>${tier[0].toUpperCase() + tier.slice(1)}</b><small class="subscore">${value}/10</small></div>`;
}

function sizeRating(size) {
  const tier = ['gold', 'silver', 'bronze'].includes(size) ? size : 'bronze';
  return `<div class="rating ${tier}"><span>Size</span><i aria-hidden="true" class="medal ${tier}"></i><b>${tier[0].toUpperCase() + tier.slice(1)}</b></div>`;
}

function countryFlagClass(country) {
  const value = String(country || '').toLowerCase();
  if (value.includes('dominican') || value === 'dr') return 'dominican';
  if (value.includes('nicaragua')) return 'nicaragua';
  if (value.includes('cuba')) return 'cuba';
  if (value.includes('honduras')) return 'honduras';
  if (value.includes('brazil')) return 'brazil';
  if (value.includes('italy')) return 'italy';
  return '';
}

function retailerLabel(urlValue) {
  try {
    const host = new URL(urlValue).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('cigarhut.com.au')) return 'Cigarhut';
    if (host.includes('cigarworld.com.au')) return 'Cigarworld';
    if (host.includes('cigarbox.com.au')) return 'CigarBox';
    return host;
  } catch (_) {
    return 'retailer';
  }
}

function riskHtml(risk) {
  const value = integer(risk, 1, 1, 3);
  const colour = value === 1 ? 'green' : value === 2 ? 'yellow' : 'red';
  const label = value === 1 ? 'Low risk' : value === 2 ? 'Moderate risk' : 'High risk';
  const icon = value === 3 ? '!' : '✓';
  return `<div aria-label="Risk: ${label.toLowerCase()}" class="risk-badge risk-${colour}"><i aria-hidden="true" class="risk-icon ${colour}">${icon}</i><span>${label}</span></div>`;
}

function stockHtml(entry) {
  const retailer = entry.retailerLinks.length ? retailerLabel(entry.retailerLinks[0]) : 'retailer';
  const status = entry.stock === 'in' ? `In stock at ${retailer}` : entry.stock === 'out' ? `Out of stock at ${retailer}` : 'Stock status unconfirmed';
  const checked = entry.stockChecked || entry.priceChecked;
  const checkedLine = checked ? `Stock checked ${esc(checked)}` : 'Stock not yet checked';
  const liveClass = entry.stock === 'in' ? 'live-stock-in' : entry.stock === 'out' ? 'live-stock-out' : 'live-stock-unknown';
  return `<div aria-label="${esc(status)}; ${esc(checkedLine)}" class="freshness ${liveClass}"${checked ? ` data-checked="${esc(entry.priceChecked || checked)}"` : ''}><span class="stock-state">${esc(status)}</span><span class="checked-state"><span class="price-checked-state">${entry.priceChecked ? `Price checked ${esc(entry.priceChecked)}` : 'Price not yet checked'}</span><span class="stock-checked-state">${esc(checkedLine)}</span></span></div>`;
}

export function renderEntryCard(rawEntry) {
  const entry = normaliseEntry(rawEntry, rawEntry?.key);
  if (!entry.key || !entry.brand || !entry.title) return '';
  const valueInfo = deriveValue(entry.price, entry.quality);
  const imageMarkup = entry.imageUrl
    ? `<img alt="${esc(`${entry.brand} ${entry.title}`)}" src="${esc(entry.imageUrl)}">`
    : entry.imageSourceKey
      ? `<img alt="${esc(`${entry.brand} ${entry.title}`)}" data-image-source-key="${esc(entry.imageSourceKey)}" src="">`
      : '';
  const production = entry.productionLines.map(line => `<span class="artmeta-line">${esc(line)}</span>`).join('');
  const practical = entry.practicalLines.map(line => `<span class="artmeta-line">${esc(line)}</span>`).join('');
  const experience = entry.experienceTags.length
    ? `<div class="tag-groups"><div class="tag-group"><span class="tag-label">Experience</span><div class="tag-items">${entry.experienceTags.map(tag => `<span class="tag-chip">${esc(tag)}</span>`).join('')}</div></div></div>`
    : '';
  const note = entry.noteHtml ? `<p class="mog-note${entry.taster ? ' taster-note' : ''}">${entry.noteHtml}</p>` : '';
  const links = entry.retailerLinks.map((url, index) => `<a class="shop" href="${esc(url)}" rel="noopener"${index ? ' style="margin-top:8px"' : ''} target="_blank">View at ${esc(retailerLabel(url))} <span>↗</span></a>`).join('');
  const countryClass = countryFlagClass(entry.country);
  const countryFlag = countryClass ? `<span aria-hidden="true" class="country-flag flag-${countryClass}"></span>` : '';
  const archivedAttrs = entry.archived ? ` data-archived="1" data-archived-at="${esc(entry.archivedAt)}"` : '';
  const tasterAttr = entry.taster ? ' data-taster="1"' : '';
  const pinAttr = entry.stockPin ? ` data-stock-pin="${esc(entry.stockPin)}"` : '';
  const rankLabel = entry.taster ? 'Taster' : 'No.';
  const rankValue = entry.taster ? `T${entry.rank}` : String(entry.rank);
  const sizeFootprint = Math.max(0.32, Math.min(1.15, (Math.max(entry.length, 1) / 5) * (Math.max(entry.ring, 1) / 50))).toFixed(4);
  return `<article class="card" data-dynamic-entry="1" data-key="${esc(entry.key)}" data-expected="${valueInfo.benchmark}" data-format="${sizeBucket(entry.size)}" data-price="${entry.price.toFixed(2)}"${entry.priceChecked ? ` data-price-checked="${esc(entry.priceChecked)}"` : ''} data-quality="${scoreBucket(entry.quality)}" data-rank="${entry.rank}" data-ratio="${Number.isFinite(valueInfo.ratio) ? valueInfo.ratio.toFixed(2) : ''}" data-risk="${entry.risk}" data-stock="${esc(entry.stock)}"${entry.stockChecked ? ` data-stock-checked="${esc(entry.stockChecked)}"` : ''} data-strength="${scoreBucket(entry.strength)}" data-value="${scoreBucket(entry.value)}"${tasterAttr}${archivedAttrs}${pinAttr}>
<div class="artframe size-normalized" data-visual-length="${entry.length}" data-visual-ring="${entry.ring}" style="--visual-footprint:${sizeFootprint}">${imageMarkup}<div class="rankflag"><span>${rankLabel}</span><b>${rankValue}</b></div>${riskHtml(entry.risk)}<div class="artmeta artmeta-left"><span class="artmeta-title">Production</span>${production}</div><div class="artmeta artmeta-right"><span class="artmeta-title">Practical</span>${practical}</div>${entry.smokeTime ? `<div class="artmeta artmeta-bottom">${esc(entry.smokeTime)}</div>` : ''}</div>
<div class="cardbody"><div class="eyebrow">${entry.archived ? 'Archived' : entry.taster ? `T${entry.rank}` : `No. ${entry.rank}`} — ${esc(entry.eyebrow)}</div><h3><span>${esc(entry.brand)}</span>${esc(entry.title)}</h3><div class="country-above"><div class="country-row">${countryFlag}<span class="country-name">${esc(entry.country)}</span></div></div><div class="facts"><div><b>${aud(entry.packagePrice)}</b><small>${esc(entry.packageLabel)}</small></div><div><b>${aud(entry.price)}</b><small>per stick</small></div><div class="size-only"><b>${entry.length}″ × ${entry.ring}</b><small>length x ring gauge</small></div></div><div class="value-calc ${tierName(entry.value)}"><span>Q${entry.quality} benchmark <b>${aud(valueInfo.benchmark)}</b></span><span>Actual <b>${aud(entry.price)}</b></span><span>Ratio <b>${Number.isFinite(valueInfo.ratio) ? valueInfo.ratio.toFixed(2) : '—'}×</b></span></div>${stockHtml(entry)}<div class="medals">${medalRating('Strength', entry.strength)}${medalRating('Quality', entry.quality)}${sizeRating(entry.size)}${medalRating('Value', entry.value)}</div>${experience}<p class="summary">${entry.summaryHtml}</p>${note}${links}</div></article>`;
}

export function injectEntriesIntoHtml(html, entries) {
  const cards = Object.values(record(entries)).map(renderEntryCard).filter(Boolean).join('\n');
  if (!cards) return html;
  const marker = /<div\b(?=[^>]*\bid=["']flat-main["'])[^>]*>/i;
  const match = marker.exec(html);
  if (!match) throw new Error('Could not find #flat-main in restored catalogue HTML.');
  const insertAt = match.index + match[0].length;
  return `${html.slice(0, insertAt)}\n${cards}\n${html.slice(insertAt)}`;
}

async function maybeInjectCatalogueHtml(request, response, env) {
  if (request.method !== 'GET' || !response || !response.ok) return response;
  const url = new URL(request.url);
  if (url.pathname !== '/' && url.pathname !== '/index.html') return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) return response;
  const state = await readState(env);
  const html = await response.text();
  const transformed = injectEntriesIntoHtml(html, state.entries);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-cache, must-revalidate');
  headers.set('x-cigar-catalogue-version', '138');
  return new Response(transformed, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/catalogue-overrides') return handleState(request, env);

    const entryMatch = url.pathname.match(/^\/api\/catalogue-entry\/([^/]+)$/);
    if (entryMatch) return handleEntry(request, env, entryMatch[1]);

    const imageMatch = url.pathname.match(/^\/api\/catalogue-image\/([^/]+)$/);
    if (imageMatch) return handleImage(request, env, imageMatch[1]);

    if (url.pathname.startsWith('/api/')) return legacyWorker.fetch(request, env, ctx);
    if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const assetResponse = await env.ASSETS.fetch(request);
      return maybeInjectCatalogueHtml(request, assetResponse, env);
    }
    return legacyWorker.fetch(request, env, ctx);
  }
};
