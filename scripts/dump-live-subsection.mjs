#!/usr/bin/env node
// Read-only: prints one compact line per entry in a named recommendation subsection.
//
// The full card records are far too large to read back through Actions logs, and the
// sandbox proxy refuses the Worker host, so this prints only the fields a catalogue
// decision actually turns on. Writes nothing and needs no secrets.

import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const sectionId = String(process.env.SUBSECTION_ID || 'petit-panatelas').trim();
const fields = String(process.env.DUMP_FIELDS
  || 'brand,title,rank,length,ring,packagePrice,packageLabel,price,quality,strength,flavour,size,risk,country,smokeTime,stock,subsection,taster,archived,defaultVariantId')
  .split(',').map(v => v.trim()).filter(Boolean);

const response = await fetch(`${baseUrl}/api/catalogue-overrides?subsection_dump=${Date.now()}`, {
  headers: { accept: 'application/json' }, cache: 'no-store'
});
if (!response.ok) throw new Error(`Live state read failed with HTTP ${response.status}.`);
const state = await response.json();

const sections = state.sections?.recommendationSubsections || [];
const section = sections.find(item => item.id === sectionId);
console.log(`SECTION ${sectionId} title=${JSON.stringify(section?.title)} entryKeys=${(section?.entryKeys || []).length}`);

const cards = state.cards || {};
const entries = state.entries || {};
// Actions log reads return the tail, so a long subsection loses its first entries. Naming
// keys narrows the dump to exactly what is being looked at.
const wanted = new Set(String(process.env.DUMP_KEYS || '').split(',').map(v => v.trim()).filter(Boolean));
// A wrong section id used to print nothing at all, which reads identically to "the card
// does not exist". Named keys are dumped whatever the section lookup did.
const sectionKeys = section?.entryKeys?.length
  ? section.entryKeys
  : Object.keys(cards).filter(key => (cards[key]?.subsection || entries[key]?.subsection) === sectionId).sort();
const keys = wanted.size ? [...wanted] : sectionKeys;

for (const key of keys) {
  const card = cards[key] || {};
  const entry = entries[key] || null;
  if (!cards[key] && !entry) {
    console.log(`ENTRY ${key} MISSING no card and no dynamic entry under this key`);
    continue;
  }
  const merged = { ...card, ...(entry || {}) };
  const picked = fields
    .filter(field => merged[field] !== undefined && merged[field] !== '')
    .map(field => `${field}=${JSON.stringify(merged[field])}`)
    .join(' ');
  console.log(`ENTRY ${key} dynamic=${entry ? 'yes' : 'no'} ${picked}`);
  const links = merged.retailerLinks || [];
  if (links.length) console.log(`   LINKS ${JSON.stringify(links)}`);
  const variants = merged.sizeVariants || [];
  if (variants.length) console.log(`   VARIANTS ${JSON.stringify(variants)}`);
  // Blends were invisible here, so a patch rewriting blendVariants could not be checked
  // against what the card already had. Printed even when empty, because "none" is the
  // fact a caller about to replace the list needs.
  const blends = merged.blendVariants || [];
  console.log(`   BLENDS ${blends.length} default=${JSON.stringify(merged.defaultBlendVariantId || '')} ${JSON.stringify(blends)}`);
}
console.log(`TOTAL_CARDS ${Object.keys(cards).length} TOTAL_ENTRIES ${Object.keys(entries).length}`);
console.log('SUBSECTION_DUMP_COMPLETE_READ_ONLY');
