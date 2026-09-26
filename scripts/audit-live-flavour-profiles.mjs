#!/usr/bin/env node
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';
import { normaliseFlavourProfile } from '../public/catalogue-flavour-axes.mjs';
import {
  blendEffectiveRecord,
  defaultBlendVariantId,
  normaliseBlendVariants
} from '../public/catalogue-variants.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const strict = process.argv.includes('--strict');

const cleanText = value => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim();

function mergeBlends(entry, card) {
  const merged = { ...(entry || {}), ...(card || {}) };
  const byId = new Map(normaliseBlendVariants(entry || {}).map(v => [v.id, { ...v }]));
  for (const variant of normaliseBlendVariants(card || {})) {
    byId.set(variant.id, { ...(byId.get(variant.id) || {}), ...variant });
  }
  if (byId.size) merged.blendVariants = [...byId.values()];
  return merged;
}

async function get(url, accept) {
  const response = await fetch(url, { headers: { accept }, cache: 'no-store' });
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  return response;
}

const [htmlResponse, stateResponse] = await Promise.all([
  get(`${baseUrl}/?catalogue_source=rankings&flavour_audit=1`, 'text/html'),
  get(`${baseUrl}/api/catalogue-overrides?verify=1`, 'application/json')
]);

const html = await htmlResponse.text();
const state = await stateResponse.json();
const articles = [...html.matchAll(/<article\b[^>]*\bdata-key=["']([^"']+)["'][^>]*>[\s\S]*?<\/article>/gi)]
  .map(match => ({ key: match[1], html: match[0] }))
  .filter(item => !/\bdata-archived=["']1["']/i.test(item.html));

const seen = new Set();
const missing = [];
const missingMarkup = [];
const axisMismatch = [];
let rendered = 0;
for (const item of articles) {
  if (seen.has(item.key)) continue;
  seen.add(item.key);
  const record = mergeBlends(state.entries?.[item.key], state.cards?.[item.key]);
  const blends = normaliseBlendVariants(record);
  const effective = blends.length
    ? blendEffectiveRecord(record, defaultBlendVariantId(record)).record
    : record;
  const profile = normaliseFlavourProfile(effective.flavourProfile);
  const expectedAxes = Object.keys(profile);
  const h3 = item.html.match(/<h3>[\s\S]*?<\/h3>/i)?.[0] || '';
  const summary = item.html.match(/<p\b[^>]*\bclass=["'][^"']*\bsummary\b[^"']*["'][^>]*>[\s\S]*?<\/p>/i)?.[0] || '';

  if (!expectedAxes.length) {
    missing.push({ key: item.key, title: cleanText(h3), summary: cleanText(summary) });
    continue;
  }

  if (!/\bclass=["'][^"']*\bflavour-profile\b/i.test(item.html)) {
    missingMarkup.push({ key: item.key, expectedAxes });
    continue;
  }

  const actualAxes = [...item.html.matchAll(/\bdata-axis=["']([a-z]+)["']/gi)].map(match => match[1]);
  const absent = expectedAxes.filter(axis => !actualAxes.includes(axis));
  if (absent.length) {
    axisMismatch.push({ key: item.key, expectedAxes, actualAxes, absent });
    continue;
  }
  rendered += 1;
}

console.log(`Flavour profile data coverage: ${seen.size - missing.length}/${seen.size} live active cards profiled.`);
console.log(`Flavour profile rendered coverage: ${rendered}/${seen.size} live active cards displaying their saved axes.`);
for (const item of missing) console.log(`MISSING_PROFILE ${item.key} | ${item.title} | ${item.summary}`);
for (const item of missingMarkup) console.log(`MISSING_MARKUP ${item.key} | expected=${item.expectedAxes.join(',')}`);
for (const item of axisMismatch) console.log(`AXIS_MISMATCH ${item.key} | expected=${item.expectedAxes.join(',')} actual=${item.actualAxes.join(',')} absent=${item.absent.join(',')}`);
if (strict && (missing.length || missingMarkup.length || axisMismatch.length)) process.exitCode = 1;
