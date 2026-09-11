import {
  STOCK_META_KEY,
  STOCK_RESULTS_KEY,
  readStockCache,
  runStockCheck
} from '../src/stock.js';

const base = String(process.env.CATALOGUE_URL || 'https://cigar-catalogue.psncodex.workers.dev').replace(/\/$/, '');
const token = String(process.env.CATALOGUE_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchOk(url, options = {}, attempts = 4) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect:'follow', ...options });
      if (response.ok) return response;
      last = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      last = error;
    }
    if (attempt < attempts) await sleep(1500 * attempt);
  }
  throw last || new Error(`Failed to fetch ${url}`);
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
  [STOCK_RESULTS_KEY]:JSON.stringify(prior.results || {}),
  [STOCK_META_KEY]:JSON.stringify(prior.meta || { lastRestockAt:0, lastFullAt:0 })
});
const env = { CATALOGUE_STATE:kv };
const now = Date.now();
const run = await runStockCheck(env, state, 'full', { html, now, fetchImpl:fetch });
const snapshot = await readStockCache(env);

const hut = [];
for (const [key, result] of Object.entries(snapshot.results || {})) {
  for (const row of result?.retailers || []) {
    if (row.retailer === 'CigarHut') hut.push([key,row]);
  }
}
const hutUnknown = hut.filter(([,row]) => row.status === 'unknown');
const hutMissing = hut.filter(([,row]) => row.status !== 'delisted' && !Number.isFinite(Number(row.price)));
console.log(`[github-stock] checked=${run.checked} CigarHut rows=${hut.length} unknown=${hutUnknown.length} missing-current-price=${hutMissing.length}`);
if (hutUnknown.length || hutMissing.length) {
  for (const [key,row] of hutUnknown) console.error('CigarHut unknown', key, row.url);
  for (const [key,row] of hutMissing) console.error('CigarHut missing price', key, row.url, row.status);
  throw new Error('Refusing to import an incomplete CigarHut snapshot.');
}

let imported = false;
for (let attempt = 1; attempt <= 18; attempt += 1) {
  try {
    const response = await fetch(`${base}/api/stock/import`, {
      method:'POST',
      headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json' },
      body:JSON.stringify(snapshot)
    });
    if (response.ok) {
      imported = true;
      break;
    }
    console.log(`[github-stock] import endpoint not ready: HTTP ${response.status} attempt ${attempt}`);
  } catch (error) {
    console.log(`[github-stock] import attempt ${attempt} failed: ${error.message}`);
  }
  await sleep(8000);
}
if (!imported) throw new Error('Could not import stock snapshot after deployment retries.');

let verified = false;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  const response = await fetchOk(`${base}/api/stock?verify-import=${now}-${attempt}`);
  const live = await response.json();
  if (Number(live.meta?.lastFullAt) === Number(snapshot.meta.lastFullAt)) {
    verified = true;
    break;
  }
  await sleep(2000);
}
if (!verified) throw new Error('Imported stock snapshot did not read back from production.');

const wise = snapshot.results?.['foundation-wise-man-maduro-lancero-half']?.retailers?.find(row => row.retailer === 'Cigarworld');
console.log('[github-stock] Wise Man Cigarworld', wise);
if (!wise || Math.abs(Number(wise.price) - 58.5) > 0.01) {
  throw new Error(`Wise Man Cigarworld price is not A$58.50: ${JSON.stringify(wise)}`);
}
console.log('[github-stock] production snapshot imported and verified');
