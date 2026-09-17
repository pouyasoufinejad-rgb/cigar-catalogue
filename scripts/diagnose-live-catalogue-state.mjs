#!/usr/bin/env node

const BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
const response = await fetch(`${BASE_URL}/api/catalogue-overrides?diagnostic=${Date.now()}`, {
  cache:'no-store',
  headers:{ accept:'application/json' }
});
if (!response.ok) throw new Error(`Live state fetch failed: HTTP ${response.status}`);
const state = await response.json();
const cards = state.cards || {};
const entries = state.entries || {};
const sections = state.sections || {};
const keys = [...new Set([...Object.keys(entries), ...Object.keys(cards)])].sort();

console.log('COUNTS', JSON.stringify({ entries:Object.keys(entries).length, cards:Object.keys(cards).length, sections:Object.keys(sections).length }));
console.log('SUBSECTIONS', JSON.stringify(sections.recommendationSubsections || []));
console.log('CARD_STATE_BEGIN');
for (const key of keys) {
  const card = cards[key] || {};
  const entry = entries[key] || {};
  const snapshot = {
    key,
    title:card.title ?? entry.title ?? null,
    catalogueType:card.catalogueType ?? entry.catalogueType ?? null,
    taster:card.taster ?? entry.taster ?? null,
    subsection:card.subsection ?? entry.subsection ?? null,
    rank:card.rank ?? entry.rank ?? null,
    archived:card.archived ?? entry.archived ?? null,
    imageUrl:card.imageUrl ?? entry.imageUrl ?? null,
    imageSourceKey:card.imageSourceKey ?? entry.imageSourceKey ?? null
  };
  console.log(JSON.stringify(snapshot));
}
console.log('CARD_STATE_END');
