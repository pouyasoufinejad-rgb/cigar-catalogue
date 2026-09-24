#!/usr/bin/env node
// Read-only. Reports two things across the whole live catalogue:
//   1. entries whose Experience section is missing or short of the usual three chips
//   2. entries carrying a "Cheapest single: no in-stock Australian single found" line,
//      which says nothing and renders twice, in Practical and in its own box
//
// Prints only the problems plus a summary, because Actions log reads return the tail and a
// full dump of a hundred-odd entries would push the findings out of it. Writes nothing and
// needs no secrets.

import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const EXPECTED_CHIPS = 3;
const EMPTY_SINGLE = /^cheapest single\s*:\s*no in-stock australian single found/i;

const response = await fetch(`${baseUrl}/api/catalogue-overrides?audit=${Date.now()}`, {
  headers: { accept: 'application/json' }, cache: 'no-store'
});
if (!response.ok) throw new Error(`Live state read failed with HTTP ${response.status}.`);
const state = await response.json();

const cards = state.cards || {};
const entries = state.entries || {};
const keys = [...new Set([...Object.keys(cards), ...Object.keys(entries)])].sort();

const shortExperience = [];
const emptySingle = [];
let complete = 0;

for (const key of keys) {
  const merged = { ...(cards[key] || {}), ...(entries[key] || {}) };
  if (merged.archived) continue;
  const name = `${merged.brand || ''} ${merged.title || ''}`.trim();

  const tags = Array.isArray(merged.experienceTags) ? merged.experienceTags.filter(Boolean) : [];
  // A static card keeps its chips in the page rather than in KV, so an absent field there
  // is not a gap. Only a dynamic entry is expected to carry its own.
  const dynamic = Boolean(entries[key]);
  if (dynamic && tags.length < EXPECTED_CHIPS) {
    shortExperience.push({ key, name, tags,
      facts: `${merged.length || '?'}x${merged.ring || '?'} ${merged.country || '?'} q${merged.quality ?? '?'} s${merged.strength ?? '?'}` });
  } else if (tags.length >= EXPECTED_CHIPS) complete += 1;

  const lines = Array.isArray(merged.practicalLines) ? merged.practicalLines : [];
  if (lines.some(line => EMPTY_SINGLE.test(String(line || '').trim()))) emptySingle.push({ key, name });
}

console.log(`AUDIT over ${keys.length} live keys (${Object.keys(entries).length} dynamic, ${Object.keys(cards).length} card overrides)`);
console.log(`  complete Experience sections: ${complete}`);

console.log(`\nEXPERIENCE MISSING OR SHORT: ${shortExperience.length}`);
for (const row of shortExperience) {
  console.log(`  ${row.key} | ${row.name} | ${row.facts} | has ${row.tags.length}: ${JSON.stringify(row.tags)}`);
}

console.log(`\nREDUNDANT CHEAPEST-SINGLE LINE: ${emptySingle.length}`);
for (const row of emptySingle) console.log(`  ${row.key} | ${row.name}`);
console.log('\nAUDIT_DONE');
