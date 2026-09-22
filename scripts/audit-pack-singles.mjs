#!/usr/bin/env node
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';
import {
  blendEffectiveRecord,
  normaliseBlendVariants,
  normaliseVariants,
  variantEffectiveRecord
} from '../public/catalogue-variants.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

function packageCount(record = {}) {
  const explicit = Number(record.packageCount);
  if (Number.isFinite(explicit) && explicit > 1) return Math.round(explicit);
  const text = [
    record.packageLabel,
    record.title,
    ...(Array.isArray(record.practicalLines) ? record.practicalLines : [])
  ].filter(Boolean).join(' ');
  const match = text.match(/\b(?:pack|tin|box|packet)\s+(?:of\s+)?(\d{1,3})\b/i)
    || text.match(/\b(\d{1,3})[- ]?(?:pack|tin|box|count|ct)\b/i);
  if (match) return Math.max(1, Number(match[1]) || 1);
  return /\b(?:pack|tin|box|packet)\b/i.test(text) ? 2 : 1;
}

function isMulti(record) {
  return packageCount(record) > 1;
}

function row(key, record, blendVariantId = '', variantId = '') {
  return {
    key,
    blendVariantId,
    variantId,
    brand: record.brand || '',
    title: record.title || '',
    packageLabel: record.packageLabel || '',
    packageCount: packageCount(record),
    packagePrice: Number(record.packagePrice) || 0,
    perStickPrice: Number(record.price) || 0,
    retailerLinks: Array.isArray(record.retailerLinks) ? record.retailerLinks : []
  };
}

const response = await fetch(`${baseUrl}/api/catalogue-overrides?pack_single_audit=${Date.now()}`, {
  headers: { accept: 'application/json' }, cache: 'no-store'
});
if (!response.ok) throw new Error(`Live state read failed with HTTP ${response.status}.`);
const state = await response.json();
const entries = state.entries || {};
const seen = new Set();
const rows = [];

for (const [key, entry] of Object.entries(entries)) {
  if (!entry || entry.archived) continue;

  const blends = normaliseBlendVariants(entry);
  const blendCandidates = blends.length
    ? blends.map(blend => ({ id: blend.id, record: blendEffectiveRecord(entry, blend.id).record }))
    : [{ id: '', record: entry }];

  for (const blend of blendCandidates) {
    const sizes = normaliseVariants(blend.record);
    const sizeCandidates = sizes.length
      ? sizes.map(size => ({ id: size.id, record: variantEffectiveRecord(blend.record, size.id).record }))
      : [{ id: '', record: blend.record }];

    for (const size of sizeCandidates) {
      if (!isMulti(size.record)) continue;
      const signature = [key, blend.id, size.id].join('|');
      if (seen.has(signature)) continue;
      seen.add(signature);
      rows.push(row(key, size.record, blend.id, size.id));
    }
  }
}

rows.sort((a, b) =>
  a.brand.localeCompare(b.brand) || a.title.localeCompare(b.title)
  || a.key.localeCompare(b.key) || a.blendVariantId.localeCompare(b.blendVariantId)
  || a.variantId.localeCompare(b.variantId));

console.log(`PACK_SINGLE_AUDIT count=${rows.length}`);
for (const item of rows) console.log(`PACK ${JSON.stringify(item)}`);
console.log('PACK_SINGLE_AUDIT_COMPLETE');
