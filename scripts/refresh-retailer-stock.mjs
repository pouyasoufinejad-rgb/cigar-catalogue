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
const state = await stateResponse.json();
const prior = await stockResponse.json();

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
const run = await runStockCheck(env, state, 'full', { html, now, fetchImpl: fetch });
const snapshot = await readStockCache(env);
console.log(`[github-stock] full crawl checked=${run.checked} failed=${run.counters.failed}`);

const findRetailer = (key, retailer) => snapshot.results?.[key]?.retailers?.find(row => row.retailer === retailer) || null;
const assertOffer = (key, retailer, status, price) => {
  const row = findRetailer(key, retailer);
  if (!row) throw new Error(`Missing ${retailer} row for ${key}`);
  if (status && row.status !== status) throw new Error(`Unexpected ${retailer} status for ${key}: ${row.status}`);
  if (price != null && Math.abs(Number(row.price) - Number(price)) > 0.01) throw new Error(`Unexpected ${retailer} price for ${key}: ${row.price}; expected ${price}`);
};

assertOffer('liga-t52-coronets', 'CigarHut', 'in', 113);
assertOffer('oliva-serie-g', 'CigarHut', 'in', 96);
assertOffer('java-x-press-maduro', 'CigarHut', 'out', 99);
assertOffer('oliva-serie-v-melanio-no4', 'CigarHut', 'out', 39);
assertOffer('davidoff-escurio-petit-robusto', 'CigarHut', 'out', 41);
assertOffer('foundation-wise-man-maduro-lancero-half', 'Cigarworld', 'in', 58.5);

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

const liveOffer = (key, retailer) => live.results?.[key]?.retailers?.find(row => row.retailer === retailer) || null;
const liveWise = liveOffer('foundation-wise-man-maduro-lancero-half', 'Cigarworld');
if (!liveWise || Math.abs(Number(liveWise.price) - 58.5) > 0.01) throw new Error(`Live Wise Man Cigarworld price is wrong: ${JSON.stringify(liveWise)}`);
const liveHutUnknown = Object.entries(live.results || {}).flatMap(([key, result]) => (result?.retailers || []).filter(row => row.retailer === 'CigarHut' && row.status === 'unknown').map(row => [key, row]));
if (liveHutUnknown.length) throw new Error(`Live cache still has ${liveHutUnknown.length} CigarHut unknown rows.`);
console.log('[github-stock] production snapshot imported and verified');
