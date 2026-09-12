import fs from 'node:fs';

const indexPath = 'src/index.js';
let index = fs.readFileSync(indexPath, 'utf8');

if (!index.includes('export async function handleStockImport')) {
  const anchor = 'export async function handleStockCheck(request, env) {';
  if (!index.includes(anchor)) throw new Error('handleStockCheck anchor not found');
  const block = `const STOCK_IMPORT_RETAILERS = new Set(['CigarHut', 'Cigarworld', 'CigarBox', 'Firmin Cigars', 'The Index', 'Ubercigar']);
const STOCK_IMPORT_STATUSES = new Set(['in', 'out', 'unknown', 'delisted']);

function validateStockImport(payload) {
  if (!isRecord(payload) || !isRecord(payload.results) || !isRecord(payload.meta)) return 'Stock snapshot must contain results and meta objects.';
  for (const field of ['lastRestockAt', 'lastFullAt']) {
    const value = Number(payload.meta[field]);
    if (!Number.isFinite(value) || value < 0) return \`Invalid stock meta field: \${field}.\`;
  }
  for (const [key, result] of Object.entries(payload.results)) {
    if (sanitiseKey(key) !== key || !isRecord(result)) return \`Invalid stock result key: \${key}.\`;
    if (!STOCK_IMPORT_STATUSES.has(result.status) || !STOCK_IMPORT_STATUSES.has(result.lastAttemptStatus)) return \`Invalid stock status for \${key}.\`;
    for (const field of ['checkedAt', 'lastAttemptAt']) {
      const value = Number(result[field]);
      if (!Number.isFinite(value) || value < 0) return \`Invalid \${field} for \${key}.\`;
    }
    const schema = Number(result.priceSchemaVersion);
    if (!Number.isFinite(schema) || schema < 1) return \`Invalid price schema for \${key}.\`;
    if (!Array.isArray(result.retailers)) return \`Retailers must be an array for \${key}.\`;
    for (const row of result.retailers) {
      if (!isRecord(row) || !STOCK_IMPORT_RETAILERS.has(row.retailer) || !STOCK_IMPORT_STATUSES.has(row.status)) return \`Invalid retailer row for \${key}.\`;
      if (!safeHttpUrl(row.url)) return \`Invalid retailer URL for \${key}.\`;
      if (own(row, 'price')) {
        const price = Number(row.price);
        if (!Number.isFinite(price) || price <= 0) return \`Invalid retailer price for \${key}.\`;
      }
    }
  }
  return '';
}

export async function handleStockImport(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'POST' } });
  const denied = await requireAdminWrite(request, env);
  if (denied) return denied;
  if (!env?.CATALOGUE_STATE) return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_STATE_BYTES) return json({ error: 'Stock snapshot is too large.' }, { status: 413 });
  let payload;
  try { payload = JSON.parse(body); }
  catch (_) { return json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const error = validateStockImport(payload);
  if (error) return json({ error }, { status: 400 });
  await Promise.all([
    env.CATALOGUE_STATE.put(STOCK_RESULTS_KEY, JSON.stringify(payload.results)),
    env.CATALOGUE_STATE.put(STOCK_META_KEY, JSON.stringify(payload.meta))
  ]);
  return json({ ok: true, cards: Object.keys(payload.results).length, meta: payload.meta });
}

`;
  index = index.replace(anchor, block + anchor);
}

const routeNeedle = "    if (url.pathname === '/api/stock') return handleStock(request, env);\n    if (url.pathname === '/api/stock/check') return handleStockCheck(request, env);";
if (!index.includes("'/api/stock/import'")) {
  if (!index.includes(routeNeedle)) throw new Error('stock route anchor not found');
  index = index.replace(routeNeedle, "    if (url.pathname === '/api/stock') return handleStock(request, env);\n    if (url.pathname === '/api/stock/import') return handleStockImport(request, env);\n    if (url.pathname === '/api/stock/check') return handleStockCheck(request, env);");
}
fs.writeFileSync(indexPath, index);

const wranglerPath = 'wrangler.jsonc';
let wrangler = fs.readFileSync(wranglerPath, 'utf8');
wrangler = wrangler.replace(/,?\s*"triggers"\s*:\s*\{\s*"crons"\s*:\s*\[[^\]]*\]\s*\}\s*(?=\})/s, '');
fs.writeFileSync(wranglerPath, wrangler);

const refresher = `import { readStockCache, runStockCheck, STOCK_RESULTS_KEY, STOCK_META_KEY } from '../src/stock.js';

const base = String(process.env.CATALOGUE_URL || 'https://cigar-catalogue.psncodex.workers.dev').replace(/\\/$/, '');
const token = String(process.env.CATALOGUE_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchOk(url, options = {}, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', ...options });
      if (response.ok) return response;
      lastError = new Error(\`\${url} returned HTTP \${response.status}\`);
    } catch (error) { lastError = error; }
    if (attempt < attempts) await sleep(1500 * attempt);
  }
  throw lastError || new Error(\`Failed to fetch \${url}\`);
}

const nonce = Date.now();
const [htmlResponse, stateResponse, stockResponse] = await Promise.all([
  fetchOk(\`\${base}/?github-stock-refresh=\${nonce}\`),
  fetchOk(\`\${base}/api/catalogue-overrides?github-stock-refresh=\${nonce}\`),
  fetchOk(\`\${base}/api/stock?github-stock-refresh=\${nonce}\`)
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
console.log(\`[github-stock] full crawl checked=\${run.checked} failed=\${run.counters.failed}\`);

const findRetailer = (key, retailer) => snapshot.results?.[key]?.retailers?.find(row => row.retailer === retailer) || null;
const assertOffer = (key, retailer, status, price) => {
  const row = findRetailer(key, retailer);
  if (!row) throw new Error(\`Missing \${retailer} row for \${key}\`);
  if (status && row.status !== status) throw new Error(\`Unexpected \${retailer} status for \${key}: \${row.status}\`);
  if (price != null && Math.abs(Number(row.price) - Number(price)) > 0.01) throw new Error(\`Unexpected \${retailer} price for \${key}: \${row.price}; expected \${price}\`);
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
console.log(\`[github-stock] CigarHut rows=\${cigarHutRows.length} unknown=\${cigarHutUnknown.length} missing-price=\${cigarHutMissingPrice.length}\`);
if (cigarHutUnknown.length || cigarHutMissingPrice.length) {
  for (const [key, row] of cigarHutUnknown) console.error('[github-stock] unresolved CigarHut', key, row.url);
  for (const [key, row] of cigarHutMissingPrice) console.error('[github-stock] missing CigarHut price', key, row.url, row.status);
  throw new Error('Refusing to import an incomplete CigarHut snapshot.');
}

let importResponse = null;
for (let attempt = 1; attempt <= 18; attempt += 1) {
  try {
    importResponse = await fetch(\`\${base}/api/stock/import\`, {
      method: 'POST',
      headers: { authorization: \`Bearer \${token}\`, 'content-type': 'application/json' },
      body: JSON.stringify(snapshot)
    });
    if (importResponse.ok) break;
    console.log(\`[github-stock] import endpoint HTTP \${importResponse.status}; retry \${attempt}\`);
  } catch (error) {
    console.log(\`[github-stock] import retry \${attempt}: \${error.message}\`);
  }
  await sleep(8000);
}
if (!importResponse?.ok) throw new Error('Could not import stock snapshot after deployment retries.');

let live = null;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  const response = await fetchOk(\`\${base}/api/stock?verify-import=\${now}-\${attempt}\`);
  live = await response.json();
  if (Number(live.meta?.lastFullAt) === Number(snapshot.meta.lastFullAt)) break;
  await sleep(2000);
}
if (Number(live?.meta?.lastFullAt) !== Number(snapshot.meta.lastFullAt)) throw new Error('Imported stock snapshot did not read back from production.');

const liveOffer = (key, retailer) => live.results?.[key]?.retailers?.find(row => row.retailer === retailer) || null;
const liveWise = liveOffer('foundation-wise-man-maduro-lancero-half', 'Cigarworld');
if (!liveWise || Math.abs(Number(liveWise.price) - 58.5) > 0.01) throw new Error(\`Live Wise Man Cigarworld price is wrong: \${JSON.stringify(liveWise)}\`);
const liveHutUnknown = Object.entries(live.results || {}).flatMap(([key, result]) => (result?.retailers || []).filter(row => row.retailer === 'CigarHut' && row.status === 'unknown').map(row => [key, row]));
if (liveHutUnknown.length) throw new Error(\`Live cache still has \${liveHutUnknown.length} CigarHut unknown rows.\`);
console.log('[github-stock] production snapshot imported and verified');
`;
fs.writeFileSync('scripts/refresh-retailer-stock.mjs', refresher);

const workflow = `name: Refresh retailer stock from GitHub

on:
  workflow_dispatch:
  schedule:
    - cron: '15 2 * * *'
  push:
    branches:
      - main
    paths:
      - 'src/index.js'
      - 'src/stock.js'
      - 'src/retailer-price.js'
      - 'scripts/refresh-retailer-stock.mjs'
      - '.github/workflows/refresh-retailer-stock.yml'
      - 'wrangler.jsonc'

permissions:
  contents: read

jobs:
  refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      CATALOGUE_ADMIN_TOKEN: \${{ secrets.CATALOGUE_ADMIN_TOKEN }}
      CATALOGUE_URL: https://cigar-catalogue.psncodex.workers.dev
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Crawl retailers and import verified snapshot
        run: node scripts/refresh-retailer-stock.mjs
`;
fs.writeFileSync('.github/workflows/refresh-retailer-stock.yml', workflow);
