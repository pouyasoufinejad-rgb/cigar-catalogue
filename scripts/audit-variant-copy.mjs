#!/usr/bin/env node
// Read-only. Finds variants whose copy is missing or, worse, inherited and wrong.
//
// A variant that omits summaryHtml inherits the card's, and the card's summary was written
// about the default size: "At 5in x 43 it is narrow enough..." is simply false once the
// reader selects the Toro. Missing copy is a gap; inherited copy that names a different
// size is an untruth on the page, so they are reported separately.

import { fileURLToPath } from 'node:url';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const COPY = ['summaryHtml', 'noteHtml', 'practicalLines', 'productionLines'];

// Any "5 x 43", "5in x 43", "5.5″ × 46" written into prose.
const SIZE_IN_TEXT = /(\d+(?:[.,]\d+)?|\d+\s*\d+\/\d+)\s*(?:in\b|inch(?:es)?|[″"'’])?\s*[x×]\s*(\d{2})\b/gi;

export function sizesMentioned(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ');
  const out = [];
  for (const match of text.matchAll(SIZE_IN_TEXT)) {
    const length = Number(String(match[1]).replace(',', '.').replace(/\s+/, ''));
    const ring = Number(match[2]);
    if (length > 2 && length < 10 && ring >= 18 && ring <= 80) out.push({ length, ring });
  }
  return out;
}

// True when the inherited prose names a size this variant is not.
export function inheritedSizeConflicts(inherited, variant) {
  const length = Number(variant.length);
  const ring = Number(variant.ring);
  if (!(length > 0) || !(ring > 0)) return null;
  for (const size of sizesMentioned(inherited)) {
    if (Math.abs(size.length - length) > 0.06 || size.ring !== ring) return size;
  }
  return null;
}

async function main() {
  const response = await fetch(`${baseUrl}/api/catalogue-overrides?copyaudit=${Date.now()}`, {
    headers: { accept: 'application/json' }, cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Live state read failed with HTTP ${response.status}.`);
  const state = await response.json();
  const cards = state.cards || {};
  const entries = state.entries || {};

  let variantCount = 0;
  let missingCount = 0;
  const conflicts = [];
  const gaps = [];

  for (const key of [...new Set([...Object.keys(cards), ...Object.keys(entries)])].sort()) {
    const merged = { ...(cards[key] || {}), ...(entries[key] || {}) };
    if (merged.archived) continue;
    const lists = [
      ['size', merged.sizeVariants || [], merged.defaultVariantId],
      ['blend', merged.blendVariants || [], merged.defaultBlendVariantId]
    ];
    for (const [kind, list, defaultId] of lists) {
      for (const variant of list) {
        variantCount += 1;
        // The default inherits the card legitimately: the card was written about it.
        const isDefault = defaultId ? variant.id === defaultId : list.indexOf(variant) === 0;
        const missing = COPY.filter(field => {
          const value = variant[field];
          return Array.isArray(value) ? value.length === 0 : !String(value || '').trim();
        });
        if (missing.length) missingCount += 1;

        const clash = !variant.summaryHtml
          ? inheritedSizeConflicts(merged.summaryHtml, variant)
          : null;
        if (clash) {
          conflicts.push(`${key} [${kind}:${variant.id}] is ${variant.length}x${variant.ring}`
            + ` but inherits copy about ${clash.length}x${clash.ring}`);
        } else if (missing.length && !isDefault) {
          gaps.push(`${key} [${kind}:${variant.id}] missing ${missing.join(',')}`);
        }
      }
    }
  }

  console.log(`VARIANTS ${variantCount} across the catalogue; ${missingCount} are missing at least one copy field`);
  console.log(`\nINHERITED COPY THAT NAMES THE WRONG SIZE: ${conflicts.length}`);
  for (const line of conflicts) console.log(`  ${line}`);
  console.log(`\nNON-DEFAULT VARIANTS MISSING COPY: ${gaps.length}`);
  for (const line of gaps) console.log(`  ${line}`);
  console.log('\nCOPY_AUDIT_DONE');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
