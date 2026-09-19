import { readStockCache, runStockCheck, STOCK_RESULTS_KEY, STOCK_META_KEY } from '../src/stock.js';

const base = String(process.env.CATALOGUE_URL || 'https://cigar-catalogue.psncodex.workers.dev').replace(/\/$/, '');
const token = String(process.env.CATALOGUE_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchOk(url, options = {}, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', ...options });
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    if (attempt < attempts) await sleep(1500 * attempt);
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
}

const nonce = Date.now();
const [htmlResponse, stateResponse, stockResponse] = await Promise.all([
  fetchOk(`${base}/?github-stock-refresh=${nonce}`),
  fetchOk(`${base}/api/catalogue-overrides?github-stock-refresh=${nonce}`),
  fetchOk(`${base}/api/stock?github-stock-refresh=${nonce}`)
]);
const html = await htmlResponse.text();
const renderedCards = [];
for (const match of html.matchAll(/<article\b[^>]*\bdata-key=["']([^"']+)["'][^>]*>/gi)) {
  const tag = match[0];
  renderedCards.push({
    key: match[1],
    archived: /\bdata-archived=["']1["']/i.test(tag),
    taster: /\bdata-taster=["']1["']/i.test(tag),
    catalogueType: tag.match(/\bdata-catalogue-type=["']([^"']+)["']/i)?.[1] || '',
    rank: tag.match(/\bdata-rank=["']([^"']+)["']/i)?.[1] || '',
    price: tag.match(/\bdata-price=["']([^"']+)["']/i)?.[1] || '',
    packagePrice: tag.match(/\bdata-package-price=["']([^"']+)["']/i)?.[1] || '',
    packageLabel: tag.match(/\bdata-package-label=["']([^"']+)["']/i)?.[1] || '',
    length: tag.match(/\bdata-length=["']([^"']+)["']/i)?.[1] || '',
    ring: tag.match(/\bdata-ring=["']([^"']+)["']/i)?.[1] || ''
  });
}
console.log('[github-stock] RENDERED_CARDS ' + JSON.stringify(renderedCards));
const auditKeys = ["ashton-aged-maduro-esquire","curivari-fuerte-chicos","don-pepin-garcia-demi-tasse","oliva-serie-g","oliva-serie-g-maduro-special-g","oliva-serie-g-petit-corona","oliva-serie-o","oliva-serie-o-petit-corona","oliva-serie-v-club-20","oliva-serie-v-melanio-no4","cohiba-short-10","cohiba-short-single","kfc-ponies-sweets","davidoff-nicaragua-mini-cigarillos","partagas-serie-club-10","tabak-especial-cafecita-negra","cao-moontrance","cao-moontrance-tubos","isla-del-sol-maduro-coronets","isla-del-sol-maduro-gran-corona"];
for (const key of auditKeys) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\console.log('[github-stock] RENDERED_CARDS ' + JSON.stringify(renderedCards));');
  const rx = new RegExp('<article\\b[^>]*\\bdata-key=["\\\']' + escaped + '["\\\'][^>]*>[\\s\\S]*?<\\/article>', 'i');
  const block = html.match(rx)?.[0] || '';
  const textBlock = block.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,' ').replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\\s+/g,' ').trim();
  console.log('[github-stock] CARD_TEXT ' + key + ' ' + JSON.stringify(textBlock.slice(0,3500)));
}
const state = await stateResponse.json();
const prior = await stockResponse.json();
const liveRows = [];
for (const [key, value] of Object.entries(state.cards || {})) {
  liveRows.push({ key, source:'card', brand:value?.brand, title:value?.title, archived:Boolean(value?.archived), catalogueType:value?.catalogueType, taster:Boolean(value?.taster), packagePrice:value?.packagePrice, price:value?.price, packageLabel:value?.packageLabel, length:value?.length, ring:value?.ring, retailerLinks:value?.retailerLinks || [] });
}
for (const [key, value] of Object.entries(state.entries || {})) {
  liveRows.push({ key, source:'entry', brand:value?.brand, title:value?.title, archived:Boolean(value?.archived), catalogueType:value?.catalogueType, taster:Boolean(value?.taster), packagePrice:value?.packagePrice, price:value?.price, packageLabel:value?.packageLabel, length:value?.length, ring:value?.ring, retailerLinks:value?.retailerLinks || [] });
}
console.log('[github-stock] STATE_SUMMARY ' + JSON.stringify(liveRows));

class MemoryKv {
  constructor(values) { this.values = new Map(Object.entries(values)); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, String(value)); }
}
const kv = new MemoryKv({
  [STOCK_RESULTS_KEY]: JSON.stringify(prior.results || {}),
  [STOCK_META_KEY]: JSON.stringify(prior.meta || { lastRestockAt: 0, lastFullAt: 0 })
});
const env = { CATALOGUE_STATE: kv };
const now = Date.now();
const run = await runStockCheck(env, state, 'full', { html, now, fetchImpl: fetch, cigarHutExactSearch: true });
const snapshot = await readStockCache(env);
console.log('[github-stock] FULL_SNAPSHOT ' + JSON.stringify(snapshot));
console.log(`[github-stock] full crawl checked=${run.checked} failed=${run.counters.failed}`);

const cigarHutRows = [];
for (const [key, result] of Object.entries(snapshot.results || {})) {
  for (const row of result?.retailers || []) if (row.retailer === 'CigarHut') cigarHutRows.push([key, row]);
}
const cigarHutUnknown = cigarHutRows.filter(([, row]) => row.status === 'unknown');
const cigarHutMissingPrice = cigarHutRows.filter(([, row]) => row.status !== 'delisted' && !Number.isFinite(Number(row.price)));
console.log(`[github-stock] CigarHut rows=${cigarHutRows.length} unknown=${cigarHutUnknown.length} missing-price=${cigarHutMissingPrice.length}`);
if (cigarHutUnknown.length || cigarHutMissingPrice.length) {
  for (const [key, row] of cigarHutUnknown) console.error('[github-stock] unresolved CigarHut', key, row.url);
  for (const [key, row] of cigarHutMissingPrice) console.error('[github-stock] missing CigarHut price', key, row.url, row.status);
  throw new Error('Refusing to import an incomplete CigarHut snapshot.');
}

let importResponse = null;
for (let attempt = 1; attempt <= 18; attempt += 1) {
  try {
    importResponse = await fetch(`${base}/api/stock/import`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(snapshot)
    });
    if (importResponse.ok) break;
    console.log(`[github-stock] import endpoint HTTP ${importResponse.status}; retry ${attempt}`);
  } catch (error) {
    console.log(`[github-stock] import retry ${attempt}: ${error.message}`);
  }
  await sleep(8000);
}
if (!importResponse?.ok) throw new Error('Could not import stock snapshot after deployment retries.');

let live = null;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  const response = await fetchOk(`${base}/api/stock?verify-import=${now}-${attempt}`);
  live = await response.json();
  if (Number(live.meta?.lastFullAt) === Number(snapshot.meta.lastFullAt)) break;
  await sleep(2000);
}
if (Number(live?.meta?.lastFullAt) !== Number(snapshot.meta.lastFullAt)) throw new Error('Imported stock snapshot did not read back from production.');

const liveHutUnknown = Object.entries(live.results || {}).flatMap(([key, result]) => (result?.retailers || []).filter(row => row.retailer === 'CigarHut' && row.status === 'unknown').map(row => [key, row]));
if (liveHutUnknown.length) throw new Error(`Live cache still has ${liveHutUnknown.length} CigarHut unknown rows.`);
console.log('[github-stock] production snapshot imported and verified');
