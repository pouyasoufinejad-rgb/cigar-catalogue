function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, number) => String.fromCodePoint(parseInt(number, 16)));
}

function textOnly(value) {
  return decodeEntities(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseWords(value) {
  return textOnly(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TITLE_STOP_WORDS = new Set(['the', 'and', 'cigar', 'cigars', 'cigarillo', 'cigarillos']);

function titleTokens(value) {
  return normaliseWords(value)
    .split(/\s+/)
    .filter(token => token.length >= 3 && !TITLE_STOP_WORDS.has(token));
}

function titleScore(candidate, target) {
  const wanted = titleTokens(target);
  if (!wanted.length) return 0;
  const actual = new Set(titleTokens(candidate));
  let matched = 0;
  wanted.forEach(token => { if (actual.has(token)) matched += 1; });
  return matched / wanted.length;
}

function packageIntent(value) {
  const text = normaliseWords(value);
  if (/\bsingle\b/.test(text)) return 'single';
  if (/\bbox\b/.test(text)) return 'box';
  if (/\btin\b/.test(text)) return 'tin';
  if (/\bpack\b/.test(text)) return 'pack';
  return '';
}

function parsePrice(value) {
  const number = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) && number > 0 && number < 100000 ? number : null;
}

function moneyCandidates(value) {
  const output = [];
  const seen = new Set();
  const rx = /(?:AUD\s*)?(?:A)?\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi;
  let match;
  while ((match = rx.exec(String(value || '')))) {
    const price = parsePrice(match[1]);
    if (price == null || seen.has(price)) continue;
    seen.add(price);
    output.push(price);
  }
  return output;
}

function choosePrice(candidates, benchmark) {
  const unique = [...new Set((candidates || []).filter(price => Number.isFinite(price) && price > 0))];
  if (!unique.length) return null;
  const target = Number(benchmark);
  if (!(Number.isFinite(target) && target > 0)) return Math.min(...unique);
  unique.sort((left, right) => {
    const leftDistance = Math.abs(Math.log(left / target));
    const rightDistance = Math.abs(Math.log(right / target));
    return leftDistance - rightDistance || left - right;
  });
  return unique[0];
}

function typesOf(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(item => String(item || '').toLowerCase());
}

function collectOfferPrices(value, output) {
  if (Array.isArray(value)) {
    value.forEach(item => collectOfferPrices(item, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const types = typesOf(value['@type']);
  if (types.includes('offer') || types.includes('aggregateoffer')) {
    for (const key of ['price', 'lowPrice', 'highPrice']) {
      const price = parsePrice(value[key]);
      if (price != null) output.push(price);
    }
  }
  if (value.offers != null) collectOfferPrices(value.offers, output);
}

function structuredProductPrices(html, context) {
  const products = [];
  const rx = /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = rx.exec(String(html || '')))) {
    let parsed;
    try { parsed = JSON.parse(decodeEntities(match[1]).trim()); }
    catch (_) { continue; }
    const visit = value => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== 'object') return;
      if (typesOf(value['@type']).includes('product')) {
        const prices = [];
        collectOfferPrices(value.offers, prices);
        if (prices.length) products.push({ name:String(value.name || ''), prices });
      }
      Object.entries(value).forEach(([key, child]) => {
        if (key !== 'offers') visit(child);
      });
    };
    visit(parsed);
  }
  if (!products.length) return [];
  const target = context?.title || '';
  const matched = products
    .map(product => ({ ...product, score:titleScore(product.name, target) }))
    .filter(product => product.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  if (matched.length) return matched[0].prices;
  return products.length === 1 ? products[0].prices : [];
}

function enclosingProductBlock(html, anchorIndex) {
  const source = String(html || '');
  const lower = source.toLowerCase();
  const candidates = [];
  for (const tag of ['li', 'article']) {
    const start = lower.lastIndexOf(`<${tag}`, anchorIndex);
    const end = start >= 0 ? lower.indexOf(`</${tag}>`, anchorIndex) : -1;
    if (start >= 0 && end >= anchorIndex && end - start < 12000) {
      candidates.push({ start, end:end + tag.length + 3 });
    }
  }
  if (!candidates.length) {
    const start = Math.max(0, anchorIndex - 500);
    return source.slice(start, Math.min(source.length, anchorIndex + 1200));
  }
  candidates.sort((a, b) => (a.end - a.start) - (b.end - b.start));
  return source.slice(candidates[0].start, candidates[0].end);
}

function listingPrice(html, context) {
  const source = String(html || '');
  const target = context?.title || '';
  if (!target) return null;
  const wantedIntent = packageIntent(context?.packageLabel);
  const candidates = [];
  const anchorRx = /<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi;
  let match;
  while ((match = anchorRx.exec(source))) {
    const label = textOnly(match[1]);
    const score = titleScore(label, target);
    if (score < 0.5) continue;
    const normalised = normaliseWords(label);
    let packageScore = 0;
    if (wantedIntent) {
      if (new RegExp(`\\b${wantedIntent}\\b`).test(normalised)) packageScore += 4;
      const conflicting = wantedIntent === 'single'
        ? /\b(?:box|pack|tin)\b/.test(normalised)
        : /\bsingle\b/.test(normalised);
      if (conflicting) packageScore -= 5;
    }
    const block = enclosingProductBlock(source, match.index);
    const prices = moneyCandidates(textOnly(block));
    if (!prices.length) continue;
    candidates.push({ score:score * 10 + packageScore, prices });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return choosePrice(candidates[0].prices, context?.packagePrice);
}

function headingMatchesProduct(html, title) {
  if (!title) return true;
  const heading = String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1] || '';
  return heading ? titleScore(textOnly(heading), title) >= 0.5 : false;
}

function primaryProductScope(html) {
  const source = String(html || '');
  const heading = /<h1\b[^>]*>[\s\S]*?<\/h1\s*>/i.exec(source);
  if (!heading) return source;

  const start = heading.index;
  const tail = source.slice(start);
  const stopRx = /<h[1-6]\b[^>]*>\s*(?:related products?|you may also like|recommended(?: products?)?|customers also(?: bought| viewed)?|similar products?)\s*<\/h[1-6]\s*>/i;
  const stop = stopRx.exec(tail);
  if (stop) return source.slice(start, start + stop.index);

  const relatedContainer = /<(?:section|aside|div)\b[^>]*(?:id|class)\s*=\s*(?:"[^"]*(?:related|recommend|upsell|similar)[^"]*"|'[^']*(?:related|recommend|upsell|similar)[^']*')[^>]*>/i.exec(tail);
  if (relatedContainer) return source.slice(start, start + relatedContainer.index);
  return tail;
}

export function extractRetailerPrice(html, context = {}) {
  if (!html || typeof html !== 'string') return null;

  const structured = structuredProductPrices(html, context);
  if (structured.length) return choosePrice(structured, context.packagePrice);

  const listed = listingPrice(html, context);
  if (listed != null) return listed;

  if (!headingMatchesProduct(html, context.title)) return null;
  const primary = primaryProductScope(html);
  return choosePrice(moneyCandidates(textOnly(primary)), context.packagePrice);
}

export { choosePrice as chooseRetailerPrice };
