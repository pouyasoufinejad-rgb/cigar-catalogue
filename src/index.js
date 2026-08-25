const STATE_KEY = 'catalogue-overrides';
const IMAGE_PREFIX = 'catalogue-image:';
const IMAGE_META_PREFIX = 'catalogue-image-meta:';
const MAX_STATE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

const DEFAULT_ENTRIES = Object.freeze({
  'tatiana-dolce-vanilla': {
    key: 'tatiana-dolce-vanilla', brand: 'Tatiana', title: 'Dolce Vanilla — Single', eyebrow: 'Best low-commitment pure-vanilla single',
    packagePrice: 22, packageLabel: 'single cigar', price: 22, length: 4.8, ring: 30, country: 'DR',
    strength: 4, quality: 6, size: 'silver', risk: 1, stock: 'in', stockPin: '', rank: 29, taster: false,
    experienceTags: ['Nicotine: Low', 'Pairings: Coffee, wafer, Biscoff', 'Occasion: Dessert smoke, vanilla test, after dinner'],
    summaryHtml: '<strong>Sweet vanilla, cream, toasted sugar, cocoa and light cedar</strong> make this a direct vanilla test with more tobacco presence than a mini. Mild spice keeps the sweetness from becoming completely flat, while the slim 30-ring format keeps the smoke fairly brisk.',
    noteHtml: '', productionLines: ['Flavoured', 'Handmade', 'Indonesian wrapper; Dominican binder and filler.'],
    practicalLines: ['Single cigar', 'Uncut', 'Cellophane protected', 'Lenient Cadence'], smokeTime: '25–35 min smoke',
    retailerUrl: 'https://www.cigarhut.com.au/tatiana-dolce-vanilla/', retailerLabel: 'Cigarhut', imageUrl: '/tatiana-dolce.webp', imageVersion: 0
  },
  'tatiana-mini-vanilla': {
    key: 'tatiana-mini-vanilla', brand: 'Tatiana', title: 'Mini Vanilla — Tin of 10', eyebrow: 'Cheapest dedicated vanilla smoke',
    packagePrice: 88, packageLabel: 'tin of 10', price: 8.8, length: 3.5, ring: 26, country: 'DR',
    strength: 3, quality: 5, size: 'bronze', risk: 2, stock: 'in', stockPin: '', rank: 30, taster: false,
    experienceTags: ['Nicotine: Low', 'Pairings: Coffee, vanilla dessert, cola', 'Occasion: Quick dessert smoke, pocket option'],
    summaryHtml: '<strong>Vanilla cream, cocoa and light cedar</strong> lead a short, direct dessert profile. The 26-ring format is quick and convenient but more heat-sensitive than the Dolce, so it rewards a slower cadence.',
    noteHtml: '', productionLines: ['Flavoured', 'Machine-made', 'Dominican tobacco.'],
    practicalLines: ['Tin of 10', 'Ready to smoke', 'Tin protected', 'Sensitive Cadence'], smokeTime: '15–20 min smoke',
    retailerUrl: 'https://www.cigarhut.com.au/tatiana-mini-vanilla/', retailerLabel: 'Cigarhut', imageUrl: '/tatiana-mini.webp', imageVersion: 0
  }
});

function defaultEntries() {
  return JSON.parse(JSON.stringify(DEFAULT_ENTRIES));
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord(value) {
  return isRecord(value) ? value : {};
}

function normaliseState(input) {
  const state = isRecord(input) ? input : {};
  const hasV3Entries = Number(state.version) >= 3 && isRecord(state.entries);
  return {
    version: 3,
    cards: cloneRecord(state.cards),
    sections: cloneRecord(state.sections),
    entries: hasV3Entries ? cloneRecord(state.entries) : defaultEntries()
  };
}

function safeKey(value) {
  const decoded = decodeURIComponent(String(value || '')).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(decoded) ? decoded : '';
}

async function readState(env) {
  if (!env.CATALOGUE_STATE) return normaliseState(null);
  let raw = null;
  try { raw = await env.CATALOGUE_STATE.get(STATE_KEY, 'json'); }
  catch (_) {
    try {
      const text = await env.CATALOGUE_STATE.get(STATE_KEY);
      raw = text ? JSON.parse(text) : null;
    } catch (_) { raw = null; }
  }
  return normaliseState(raw);
}

async function handleState(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const response = json(await readState(env));
    return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD, PUT' } });
  if (!env.CATALOGUE_STATE) return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_STATE_BYTES) return json({ error: 'Catalogue state is too large.' }, { status: 413 });
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { return json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const state = normaliseState(parsed);
  await env.CATALOGUE_STATE.put(STATE_KEY, JSON.stringify(state));
  return json({ ok: true, version: 3, cards: Object.keys(state.cards).length, entries: Object.keys(state.entries).length });
}

async function handleImage(request, env, key) {
  key = safeKey(key);
  if (!key) return json({ error: 'Invalid image key.' }, { status: 400 });
  if (!env.CATALOGUE_STATE) return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });
  const imageKey = `${IMAGE_PREFIX}${key}`;
  const metaKey = `${IMAGE_META_PREFIX}${key}`;

  if (request.method === 'GET' || request.method === 'HEAD') {
    const data = await env.CATALOGUE_STATE.get(imageKey, 'arrayBuffer');
    if (!data) return new Response('Not found', { status: 404 });
    const contentType = (await env.CATALOGUE_STATE.get(metaKey)) || 'image/webp';
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
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) return json({ error: 'Only WebP, JPEG and PNG images are accepted.' }, { status: 415 });
    const data = await request.arrayBuffer();
    if (!data.byteLength) return json({ error: 'Image is empty.' }, { status: 400 });
    if (data.byteLength > MAX_IMAGE_BYTES) return json({ error: 'Image exceeds 2 MiB after compression.' }, { status: 413 });
    await env.CATALOGUE_STATE.put(imageKey, data);
    await env.CATALOGUE_STATE.put(metaKey, contentType);
    return json({ ok: true, key, bytes: data.byteLength, contentType });
  }

  if (request.method === 'DELETE') {
      await env.CATALOGUE_STATE.delete(imageKey);
    await env.CATALOGUE_STATE.delete(metaKey);
    return json({ ok: true, key });
  }
  return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD, PUT, DELETE' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/catalogue-overrides') return handleState(request, env);
    const imageMatch = url.pathname.match(/^\/api\/catalogue-image\/([^/]+)$/);
    if (imageMatch) return handleImage(request, env, imageMatch[1]);
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found.' }, { status: 404 });
    if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') return new Response('Static assets unavailable.', { status: 503 });
    return env.ASSETS.fetch(request);
  }
};
