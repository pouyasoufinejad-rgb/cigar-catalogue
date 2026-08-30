export const STOCK_RESULTS_KEY = 'catalogue-stock:results';
export const STOCK_META_KEY = 'catalogue-stock:meta';
export const STOCK_RESTOCK_CRON = '15 2 * * *';
export const STOCK_FULL_CRON = '45 2 * * SUN';

export const STOCK_REQUEST_TIMEOUT_MS = 12000;
export const STOCK_MAX_CONCURRENT = 5;
const CIGARHUT_ORIGIN = 'https://www.cigarhut.com.au';
const CIGARHUT_CIGARS = `${CIGARHUT_ORIGIN}/cigars/`;
const RETAILERS = [
  { host: 'cigarhut.com.au', label: 'CigarHut' },
  { host: 'cigarworld.com.au', label: 'Cigarworld' },
  { host: 'cigarbox.com.au', label: 'CigarBox' }
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch (_) { return fallback; }
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}

function parseAttributes(raw) {
  const attrs = {};
  const rx = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = rx.exec(raw || ''))) {
    const name = match[1].toLowerCase();
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function parseHtml(html) {
  const source = String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, '');
  const root = { tag:'#document', attrs:{}, children:[], parent:null, text:'' };
  const stack = [root];
  const tokenRx = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g;
  let match;
  while ((match = tokenRx.exec(source))) {
    const token = match[0];
    if (!token || token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (!token.startsWith('<')) {
      stack[stack.length - 1].children.push({ tag:'#text', attrs:{}, children:[], parent:stack[stack.length - 1], text:decodeEntities(token) });
      continue;
    }
    const closing = token.match(/^<\s*\/\s*([a-zA-Z0-9:-]+)/);
    if (closing) {
      const tag = closing[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const open = token.match(/^<\s*([a-zA-Z0-9:-]+)([\s\S]*?)\/?\s*>$/);
    if (!open) continue;
    const tag = open[1].toLowerCase();
    const parent = stack[stack.length - 1];
    const node = { tag, attrs:parseAttributes(open[2]), children:[], parent, text:'' };
    parent.children.push(node);
    const selfClosing = /\/\s*>$/.test(token) || VOID_TAGS.has(tag);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

function walk(node, visitor) {
  for (const child of node?.children || []) {
    visitor(child);
    walk(child, visitor);
  }
}

function findAll(root, predicate) {
  const output = [];
  walk(root, node => { if (predicate(node)) output.push(node); });
  return output;
}

function findFirst(root, predicate) {
  let result = null;
  (function visit(node) {
    if (result) return;
    for (const child of node?.children || []) {
      if (predicate(child)) { result = child; return; }
      visit(child);
      if (result) return;
    }
  })(root);
  return result;
}

function classString(node) {
  return String(node?.attrs?.class || '');
}

function classTokens(node) {
  return classString(node).split(/\s+/).filter(Boolean);
}

function hasClass(node, name) {
  return classTokens(node).includes(name);
}

function textContent(node, excluded = null) {
  if (!node || (excluded && excluded.has(node))) return '';
  if (node.tag === '#text') return node.text || '';
  return (node.children || []).map(child => textContent(child, excluded)).join(' ');
}

function rootForDocument(doc) {
  return findFirst(doc, node => node.tag === 'main')
    || findFirst(doc, node => hasClass(node, 'page'))
    || findFirst(doc, node => hasClass(node, 'body'))
    || findFirst(doc, node => node.tag === 'body')
    || doc;
}

function isInside(node, predicate) {
  let current = node?.parent;
  while (current) {
    if (predicate(current)) return true;
    current = current.parent;
  }
  return false;
}

function normalisePathname(value) {
  try {
    const url = new URL(value, CIGARHUT_ORIGIN);
    let path = url.pathname;
    try { path = decodeURIComponent(path); } catch (_) {}
    path = path.replace(/\/{2,}/g, '/');
    if (!path.endsWith('/')) path += '/';
    return path.toLowerCase();
  } catch (_) { return ''; }
}

function canonicalCategoryUrl(value) {
  try {
    const url = new URL(value, CIGARHUT_ORIGIN);
    url.hash = '';
    url.search = '';
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.toString();
  } catch (_) { return ''; }
}

function retailerForUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return RETAILERS.find(retailer => host === retailer.host || host.endsWith(`.${retailer.host}`)) || null;
  } catch (_) { return null; }
}

function retailerLinks(urls) {
  const seen = new Set();
  const output = [];
  for (const raw of Array.isArray(urls) ? urls : []) {
    let url;
    try { url = new URL(String(raw || '')).toString(); }
    catch (_) { continue; }
    const retailer = retailerForUrl(url);
    if (!retailer || seen.has(retailer.label)) continue;
    seen.add(retailer.label);
    output.push({ retailer:retailer.label, url });
  }
  return output;
}

export function parseListingPage(html, targetPaths, pageUrl = CIGARHUT_ORIGIN) {
  const statuses = new Map();
  const pricedPaths = new Set();
  if (!html || typeof html !== 'string') return statuses;
  const doc = parseHtml(html);
  const root = rootForDocument(doc);
  if (!root) return statuses;

  findAll(root, node => node.tag === 'a' && node.attrs.href != null).forEach(anchor => {
    const href = anchor.attrs.href || '';
    let path = '';
    try { path = normalisePathname(new URL(href, pageUrl).toString()); } catch (_) { return; }
    if (!path || !targetPaths.has(path)) return;
    const label = textContent(anchor).trim().toLowerCase();
    if (label === 'out of stock' || label === 'sold out') {
      if (!statuses.has(path)) statuses.set(path, { status:'out' });
    } else if (label === 'choose options' || label === 'add to cart' || label === 'add to bag') {
      statuses.set(path, { status:'in' });
    } else if (/\$\s?\d/.test(label)) {
      pricedPaths.add(path);
    }
  });
  pricedPaths.forEach(path => { if (!statuses.has(path)) statuses.set(path, { status:'in' }); });
  return statuses;
}

function categoryBlock(node) {
  const cls = classString(node);
  const tokens = classTokens(node);
  return tokens.includes('subcategories')
    || cls.includes('subcategor')
    || ['category-list','categoryList','category-grid','categoryGrid','category-menu','categoryMenu','navList'].some(name => tokens.includes(name));
}

function excludedCategoryAncestor(node) {
  const excluded = current => current?.tag === 'header' || current?.tag === 'nav' || current?.tag === 'footer' || hasClass(current, 'breadcrumb') || hasClass(current, 'breadcrumbs');
  return excluded(node) || isInside(node, excluded);
}

export function discoverCategoryLinks(html, pageUrl, targetPaths) {
  if (!html || typeof html !== 'string') return [];
  const doc = parseHtml(html);
  const root = rootForDocument(doc);
  if (!root) return [];
  const blocks = findAll(root, node => categoryBlock(node) && !excludedCategoryAncestor(node))
    .filter(block => findAll(block, node => node.tag === 'a' && node.attrs.href != null).length > 0);
  const links = [];
  const seen = new Set();
  for (const block of blocks) {
    for (const anchor of findAll(block, node => node.tag === 'a' && node.attrs.href != null)) {
      let url;
      try { url = new URL(anchor.attrs.href || '', pageUrl); } catch (_) { continue; }
      if (url.hostname.toLowerCase().replace(/^www\./, '') !== 'cigarhut.com.au') continue;
      if (!/^https?:$/.test(url.protocol)) continue;
      const targetPath = normalisePathname(url.toString());
      if (!targetPath || targetPaths.has(targetPath) || targetPath === normalisePathname(pageUrl)) continue;
      if (/\.(?:jpg|jpeg|png|webp|gif|svg|pdf|xml)$/i.test(url.pathname)) continue;
      if (/\/(?:cart|account|login|search|contact|shipping|privacy|terms|wishlist)\/?$/i.test(url.pathname)) continue;
      const canonical = canonicalCategoryUrl(url.toString());
      if (!canonical || seen.has(canonical)) continue;
      seen.add(canonical);
      links.push(canonical);
    }
  }
  return links;
}

export function discoverPaginationLinks(html, pageUrl) {
  if (!html || typeof html !== 'string') return [];
  const doc = parseHtml(html);
  const anchors = findAll(doc, node => node.tag === 'a' && node.attrs.href != null && isInside(node, ancestor => hasClass(ancestor, 'pagination') || classString(ancestor).includes('pagination')));
  const links = [];
  const seen = new Set();
  for (const anchor of anchors) {
    try {
      const url = new URL(anchor.attrs.href || '', pageUrl);
      const page = Number(url.searchParams.get('page'));
      if (!Number.isInteger(page) || page < 2 || page > 4) continue;
      const value = url.toString();
      if (!seen.has(value)) { seen.add(value); links.push(value); }
    } catch (_) {}
  }
  return links;
}

function relatedMarker(node) {
  const marker = `${node?.attrs?.id || ''} ${classString(node)}`.toLowerCase();
  return /related|carousel|recently|upsell|recommend|suggest|similar|also[-_ ]?like/.test(marker);
}

function closestRelatedHeadingBlock(node) {
  let current = node?.parent;
  while (current) {
    const cls = classString(current);
    if (current.tag === 'section' || current.tag === 'aside' || current.tag === 'div' || cls.includes('related') || cls.includes('recommend') || cls.includes('similar')) return current;
    current = current.parent;
  }
  return null;
}

export function detectAvailability(html) {
  if (!html || typeof html !== 'string') return 'unknown';
  const doc = parseHtml(html);
  const excluded = new Set(findAll(doc, node => ['header','nav','footer'].includes(node.tag) || relatedMarker(node)));
  for (const heading of findAll(doc, node => /^h[1-6]$/.test(node.tag))) {
    const label = textContent(heading).trim().toLowerCase();
    if (!/related products|you may also like|recommended for you|customers also|similar products/.test(label)) continue;
    const block = closestRelatedHeadingBlock(heading);
    if (block && !hasClass(block, 'productView')) excluded.add(block);
  }

  const root = findFirst(doc, node => hasClass(node, 'productView'))
    || findFirst(doc, node => node.tag === 'main')
    || findFirst(doc, node => node.tag === 'body')
    || doc;
  if (!root) return 'unknown';
  const text = textContent(root, excluded).toLowerCase();
  const buySignal = /add to cart|add to bag|choose options|buy now/.test(text);
  const outSignal = /out of stock|sold out|currently unavailable|temporarily unavailable|notify me when|email me when available|back in stock/.test(text);
  const rendered = /\$\s?\d/.test(text) || buySignal || outSignal;
  if (!rendered) return 'unknown';
  if (buySignal) return 'in';
  if (outSignal) return 'out';
  return 'in';
}

export function aggregateRetailerResults(retailers, lastConfirmed = 'unknown') {
  const definite = retailers.filter(item => item.status === 'in' || item.status === 'out');
  const cigarhutVote = retailers.find(item => item.retailer === 'CigarHut');
  if (!definite.length) return lastConfirmed;
  if (definite.some(item => item.status === 'in')) return 'in';
  if (cigarhutVote && cigarhutVote.status === 'unknown' && definite.length === 1 && definite[0].retailer !== 'CigarHut') return lastConfirmed;
  return 'out';
}

function extractArticleCards(html) {
  const output = [];
  const rx = /<article\b([^>]*\bdata-key=(?:"[^"]+"|'[^']+')[^>]*)>([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = rx.exec(String(html || '')))) {
    const attrs = parseAttributes(match[1]);
    const key = String(attrs['data-key'] || '').trim();
    if (!key) continue;
    const urls = [];
    const linkRx = /<a\b([^>]*\bclass=(?:"[^"]*\bshop\b[^"]*"|'[^']*\bshop\b[^']*')[^>]*)>/gi;
    let link;
    while ((link = linkRx.exec(match[2]))) {
      const linkAttrs = parseAttributes(link[1]);
      if (linkAttrs.href) urls.push(linkAttrs.href);
    }
    const h3 = match[2].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || key;
    const title = decodeEntities(h3.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    output.push({
      key,
      title,
      archived: attrs['data-archived'] === '1',
      stockPin: attrs['data-stock-pin'] || '',
      stock: ['in','out','unknown','delisted'].includes(attrs['data-stock']) ? attrs['data-stock'] : 'unknown',
      retailerLinks: urls
    });
  }
  return output;
}

function normalisePin(value) {
  const pin = String(value || '').toLowerCase();
  return ['in','out','hold'].includes(pin) ? pin : '';
}

export function extractStockTargetsFromHtml(html, state = {}) {
  const byKey = new Map();
  const cards = isRecord(state.cards) ? state.cards : {};
  for (const base of extractArticleCards(html)) {
    const override = isRecord(cards[base.key]) ? cards[base.key] : {};
    const target = {
      ...base,
      archived: own(override, 'archived') ? Boolean(override.archived) : base.archived,
      stockPin: own(override, 'stockPin') ? normalisePin(override.stockPin) : normalisePin(base.stockPin),
      stock: own(override, 'stock') && ['in','out','unknown','delisted'].includes(override.stock) ? override.stock : base.stock,
      retailerLinks: Array.isArray(override.retailerLinks) ? override.retailerLinks : base.retailerLinks
    };
    byKey.set(base.key, target);
  }

  const entries = isRecord(state.entries) ? state.entries : {};
  for (const [key, raw] of Object.entries(entries)) {
    if (!isRecord(raw)) continue;
    const override = isRecord(cards[key]) ? cards[key] : {};
    byKey.set(key, {
      key,
      title: `${raw.brand || ''} ${raw.title || key}`.trim(),
      archived: own(override, 'archived') ? Boolean(override.archived) : Boolean(raw.archived),
      stockPin: normalisePin(own(override, 'stockPin') ? override.stockPin : raw.stockPin),
      stock: ['in','out','unknown','delisted'].includes(raw.stock) ? raw.stock : 'unknown',
      retailerLinks: Array.isArray(override.retailerLinks) ? override.retailerLinks : (Array.isArray(raw.retailerLinks) ? raw.retailerLinks : [])
    });
  }

  return Array.from(byKey.values())
    .filter(target => !target.archived && !target.stockPin)
    .map(target => ({ ...target, links:retailerLinks(target.retailerLinks) }))
    .filter(target => target.links.length > 0);
}

async function fetchWithTimeout(url, fetchImpl, options = {}, timeoutMs = STOCK_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal:controller.signal, cache:'no-store', headers:{ 'user-agent':'Cigar Catalogue Stock Checker/1.0', ...(options.headers || {}) } });
  } finally { clearTimeout(timeout); }
}

async function fetchPage(url, fetchImpl, cacheBust = false) {
  const target = new URL(url);
  if (cacheBust) target.searchParams.set('_catalogue_stock_check', Date.now().toString());
  const response = await fetchWithTimeout(target.toString(), fetchImpl);
  const html = await response.text();
  if (response.status === 404) return { html, targetStatus:404 };
  if (!response.ok) throw new Error(`Retailer HTTP ${response.status}`);
  return { html, targetStatus:response.status };
}

async function promisePool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      try { results[index] = await tasks[index](); }
      catch (error) { results[index] = { error }; }
    }
  }
  await Promise.all(Array.from({ length:Math.min(limit, tasks.length || 1) }, worker));
  return results;
}

async function runCategorySweep(cardPlans, fetchImpl, counters) {
  const refsByPath = new Map();
  cardPlans.forEach((plan, key) => {
    plan.links.forEach((link, linkIndex) => {
      if (link.retailer !== 'CigarHut' || plan.retailerResults[linkIndex]) return;
      const path = normalisePathname(link.url);
      if (!path) return;
      if (!refsByPath.has(path)) refsByPath.set(path, []);
      refsByPath.get(path).push({ key, plan, link, linkIndex });
    });
  });
  if (!refsByPath.size) return;

  const targetPaths = new Set(refsByPath.keys());
  const queue = [{ url:CIGARHUT_CIGARS, depth:0 }];
  const queued = new Set([canonicalCategoryUrl(CIGARHUT_CIGARS)]);
  const fetchedCategories = new Set();
  const found = new Map();
  const seenPagination = new Set();
  let fetchCount = 0;

  const mergeListingResults = results => {
    results.forEach((value, path) => {
      const prior = found.get(path);
      if (!prior || value.status === 'in' || prior.status !== 'in') found.set(path, value);
    });
  };

  while (queue.length && fetchCount < 30 && found.size < targetPaths.size) {
    const batch = [];
    while (queue.length && batch.length < STOCK_MAX_CONCURRENT && fetchCount + batch.length < 30) {
      const current = queue.shift();
      const canonical = canonicalCategoryUrl(current.url);
      if (!canonical || fetchedCategories.has(canonical)) continue;
      fetchedCategories.add(canonical);
      batch.push({ ...current, canonical });
    }
    if (!batch.length) continue;

    fetchCount += batch.length;
    const baseResults = await promisePool(batch.map(item => async () => {
      try {
        const page = await fetchPage(item.canonical, fetchImpl, false);
        if (!page || page.targetStatus === 404 || !page.html) { counters.failed++; return { item, page:null }; }
        return { item, page };
      } catch (_) { counters.failed++; return { item, page:null }; }
    }), STOCK_MAX_CONCURRENT);
    const paginationQueue = [];

    baseResults.forEach(result => {
      if (!result?.item || !result.page) return;
      const { item, page } = result;
      mergeListingResults(parseListingPage(page.html, targetPaths, item.canonical));
      if (item.depth < 2) {
        discoverCategoryLinks(page.html, item.canonical, targetPaths).forEach(child => {
          const childCanonical = canonicalCategoryUrl(child);
          if (!childCanonical || queued.has(childCanonical) || fetchedCategories.has(childCanonical)) return;
          queued.add(childCanonical);
          queue.push({ url:childCanonical, depth:item.depth + 1 });
        });
      }
      discoverPaginationLinks(page.html, item.canonical).forEach(pageUrl => {
        if (fetchCount + paginationQueue.length >= 30 || seenPagination.has(pageUrl)) return;
        seenPagination.add(pageUrl);
        paginationQueue.push(pageUrl);
      });
    });

    if (paginationQueue.length && fetchCount < 30) {
      const pageUrls = paginationQueue.slice(0, 30 - fetchCount);
      fetchCount += pageUrls.length;
      const pages = await promisePool(pageUrls.map(pageUrl => async () => {
        try {
          const page = await fetchPage(pageUrl, fetchImpl, false);
          if (!page || page.targetStatus === 404 || !page.html) { counters.failed++; return { page:null, pageUrl }; }
          return { page, pageUrl };
        } catch (_) { counters.failed++; return { page:null, pageUrl }; }
      }), STOCK_MAX_CONCURRENT);
      pages.filter(result => result?.page).forEach(result => mergeListingResults(parseListingPage(result.page.html, targetPaths, result.pageUrl)));
    }
  }

  refsByPath.forEach((refs, path) => {
    const result = found.get(path);
    refs.forEach(ref => {
      if (ref.plan.retailerResults[ref.linkIndex]) return;
      if (result) {
        ref.plan.retailerResults[ref.linkIndex] = { retailer:'CigarHut', status:result.status, url:ref.link.url };
        counters.sweepResolved++;
      } else {
        ref.plan.retailerResults[ref.linkIndex] = { retailer:'CigarHut', status:'unknown', url:ref.link.url };
        counters.delistingCandidates.set(ref.key, ref.plan.title || ref.key);
      }
    });
  });
}

async function runProductPass(cardPlans, fetchImpl, counters) {
  const tasks = [];
  cardPlans.forEach(plan => {
    plan.links.forEach((link, linkIndex) => {
      if (link.retailer === 'CigarHut' || plan.retailerResults[linkIndex]) return;
      tasks.push(async () => {
        let status = 'unknown';
        try {
          const page = await fetchPage(link.url, fetchImpl, true);
          status = detectAvailability(page.html);
        } catch (_) { status = 'unknown'; }
        plan.retailerResults[linkIndex] = { retailer:link.retailer, status, url:link.url };
        if (status === 'unknown') counters.failed++;
        else counters.productResolved++;
      });
    });
  });
  await promisePool(tasks, STOCK_MAX_CONCURRENT);
}

export async function readStockCache(env) {
  if (!env?.CATALOGUE_STATE) return { results:{}, meta:{ lastRestockAt:0, lastFullAt:0 } };
  const [resultsRaw, metaRaw] = await Promise.all([
    env.CATALOGUE_STATE.get(STOCK_RESULTS_KEY),
    env.CATALOGUE_STATE.get(STOCK_META_KEY)
  ]);
  return {
    results:isRecord(safeJson(resultsRaw, {})) ? safeJson(resultsRaw, {}) : {},
    meta:isRecord(safeJson(metaRaw, {})) ? safeJson(metaRaw, {}) : { lastRestockAt:0, lastFullAt:0 }
  };
}

async function writeStockCache(env, results, meta) {
  await Promise.all([
    env.CATALOGUE_STATE.put(STOCK_RESULTS_KEY, JSON.stringify(results)),
    env.CATALOGUE_STATE.put(STOCK_META_KEY, JSON.stringify(meta))
  ]);
}

async function loadBaseHtml(env) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') return '';
  const response = await env.ASSETS.fetch(new Request('https://catalogue-assets.local/index.html'));
  return response?.ok ? response.text() : '';
}

export async function runStockCheck(env, state, mode = 'restock', options = {}) {
  if (!env?.CATALOGUE_STATE) throw new Error('CATALOGUE_STATE KV binding is unavailable.');
  const fetchImpl = options.fetchImpl || fetch;
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const html = options.html != null ? String(options.html) : await loadBaseHtml(env);
  const targets = extractStockTargetsFromHtml(html, state);
  const cache = await readStockCache(env);
  const results = { ...cache.results };
  const meta = { lastRestockAt:Number(cache.meta.lastRestockAt) || 0, lastFullAt:Number(cache.meta.lastFullAt) || 0 };
  const isFull = mode === 'full';
  const selected = targets.filter(target => {
    if (isFull) return true;
    const saved = results[target.key];
    if ((saved?.status === 'delisted') || target.stock === 'delisted') return false;
    return target.stock === 'out' || saved?.status === 'out';
  });

  if (!selected.length) {
    if (isFull) { meta.lastFullAt = now; meta.lastRestockAt = now; }
    else meta.lastRestockAt = now;
    await writeStockCache(env, results, meta);
    return { mode, checked:0, restocked:[], counters:{sweepResolved:0,productResolved:0,failed:0,delistingCandidates:[]} };
  }

  const plans = new Map();
  for (const target of selected) {
    const saved = results[target.key];
    const oldStatus = saved?.status && saved.status !== 'unknown' ? saved.status : target.stock;
    plans.set(target.key, { ...target, oldStatus, retailerResults:new Array(target.links.length) });
  }

  const counters = { sweepResolved:0, productResolved:0, failed:0, delistingCandidates:new Map() };
  await runCategorySweep(plans, fetchImpl, counters);
  await runProductPass(plans, fetchImpl, counters);

  const restocked = [];
  plans.forEach((plan, key) => {
    plan.links.forEach((link, index) => {
      if (plan.retailerResults[index]) return;
      plan.retailerResults[index] = { retailer:link.retailer, status:'unknown', url:link.url };
      if (link.retailer === 'CigarHut') counters.delistingCandidates.set(key, plan.title || key);
      else counters.failed++;
    });
    const retailerResults = plan.retailerResults.filter(Boolean);
    const attemptedStatus = aggregateRetailerResults(retailerResults, plan.oldStatus || 'unknown');
    const confirmedStatus = attemptedStatus === 'unknown' ? plan.oldStatus : attemptedStatus;
    const previous = results[key] || {};
    results[key] = {
      ...previous,
      status:confirmedStatus,
      lastAttemptStatus:attemptedStatus,
      checkedAt:attemptedStatus === 'unknown' ? (previous.checkedAt || now) : now,
      lastAttemptAt:now,
      retailers:retailerResults
    };
    if (['out','delisted'].includes(plan.oldStatus) && attemptedStatus === 'in') restocked.push(key);
  });

  if (isFull) { meta.lastFullAt = now; meta.lastRestockAt = now; }
  else meta.lastRestockAt = now;
  await writeStockCache(env, results, meta);
  return {
    mode,
    checked:plans.size,
    restocked,
    counters:{
      sweepResolved:counters.sweepResolved,
      productResolved:counters.productResolved,
      failed:counters.failed,
      delistingCandidates:Array.from(counters.delistingCandidates.values())
    }
  };
}
