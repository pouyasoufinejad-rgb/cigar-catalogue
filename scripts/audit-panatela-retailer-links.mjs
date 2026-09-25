#!/usr/bin/env node
// Read-only. For one recommendation subsection, reports which of the three preferred
// retailers are missing a link, and whether that retailer actually carries the product.
//
// A missing link only matters if the shop stocks the thing. So this harvests each
// retailer's own product index once and matches the catalogue's brand and title against
// it, rather than guessing at per-shop search URLs. The sandbox proxy refuses .com.au, so
// it has to run in Actions. Writes nothing and needs no secrets.

import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const sectionId = String(process.env.SUBSECTION_ID || 'petit-panatelas').trim();

export const RETAILERS = Object.freeze([
  { id: 'theindex', label: 'The Index', host: 'theindexcigars.com.au',
    indexes: ['https://www.theindexcigars.com.au/sitemap_products_1.xml?from=1&to=99999999999',
              'https://www.theindexcigars.com.au/sitemap.xml'] },
  { id: 'cigarhut', label: 'CigarHut', host: 'cigarhut.com.au',
    indexes: ['https://www.cigarhut.com.au/sitemap.xml', 'https://www.cigarhut.com.au/sitemap_index.xml'] },
  { id: 'cigarworld', label: 'Cigarworld', host: 'cigarworld.com.au',
    indexes: ['https://www.cigarworld.com.au/aud/sitemap.xml', 'https://www.cigarworld.com.au/sitemap.xml'] }
]);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const STOP = new Set(['the','a','of','and','by','cigars','cigar','single','pack','tin','box','x','with','for']);

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/%[0-9a-f]{2}/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(word => word.length > 2 && !STOP.has(word));
}

// Jaccard-ish: how much of the catalogue name the candidate covers. Favours a candidate
// that contains every word of the product name over one that merely shares a brand.
export function score(wanted, candidate) {
  if (!wanted.length) return 0;
  const have = new Set(candidate);
  const hits = wanted.filter(word => have.has(word)).length;
  return hits / wanted.length;
}

async function text(url) {
  try {
    const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA } });
    if (!response.ok) return '';
    return await response.text();
  } catch { return ''; }
}

// Follows one level of sitemap index, which is how most shops split their product list.
async function harvest(retailer) {
  const urls = new Set();
  const queue = [...retailer.indexes];
  const seen = new Set();
  while (queue.length && urls.size < 20000) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const body = await text(url);
    if (!body) continue;
    const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]);
    for (const loc of locs) {
      if (/\.xml(\?|$)/i.test(loc)) { if (seen.size < 40) queue.push(loc); continue; }
      if (loc.includes(retailer.host)) urls.add(loc);
    }
  }
  return [...urls];
}

const response = await fetch(`${baseUrl}/api/catalogue-overrides?linkaudit=${Date.now()}`, {
  headers: { accept: 'application/json' }, cache: 'no-store'
});
if (!response.ok) throw new Error(`Live state read failed with HTTP ${response.status}.`);
const state = await response.json();
const cards = state.cards || {};
const entries = state.entries || {};
const section = (state.sections?.recommendationSubsections || []).find(item => item.id === sectionId);
const keys = section?.entryKeys?.length
  ? section.entryKeys
  : Object.keys(cards).filter(key => (cards[key]?.subsection || entries[key]?.subsection) === sectionId);

console.log(`SUBSECTION ${sectionId}: ${keys.length} entries`);

const harvested = {};
for (const retailer of RETAILERS) {
  harvested[retailer.id] = await harvest(retailer);
  console.log(`INDEX ${retailer.label}: ${harvested[retailer.id].length} product urls`);
}

for (const key of keys) {
  const merged = { ...(cards[key] || {}), ...(entries[key] || {}) };
  if (merged.archived) continue;
  const name = `${merged.brand || ''} ${merged.title || ''}`.replace(/—.*$/, '').trim();
  // Links on the card itself plus every variant, since a variant link still reaches the shop.
  const links = [
    ...(merged.retailerLinks || []),
    ...(merged.sizeVariants || []).flatMap(v => v.retailerLinks || []),
    ...(merged.blendVariants || []).flatMap(v => v.retailerLinks || [])
  ].map(String);

  const wanted = tokens(name);
  const gaps = [];
  for (const retailer of RETAILERS) {
    if (links.some(link => link.includes(retailer.host))) continue;
    const ranked = harvested[retailer.id]
      .map(url => ({ url, s: score(wanted, tokens(url)) }))
      .filter(row => row.s >= 0.6)
      .sort((a, b) => b.s - a.s)
      .slice(0, 2);
    gaps.push({ retailer: retailer.label, ranked });
  }
  if (!gaps.length) continue;
  console.log(`\n${key} | ${name}`);
  for (const gap of gaps) {
    if (!gap.ranked.length) { console.log(`   ${gap.retailer}: no link, nothing matching in their index`); continue; }
    console.log(`   ${gap.retailer}: NO LINK but they list:`);
    for (const row of gap.ranked) console.log(`       ${row.s.toFixed(2)} ${row.url}`);
  }
}
console.log('\nLINK_AUDIT_DONE');
