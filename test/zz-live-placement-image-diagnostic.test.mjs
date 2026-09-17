import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCatalogueSeed } from '../scripts/cleanup-live-card-copy.mjs';

const BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
const FIELDS = ['catalogueType','taster','subsection','rank','imageUrl','imageSourceKey','archived'];

function short(value) {
  if (typeof value !== 'string') return value;
  return value.length > 180 ? `${value.slice(0, 177)}...` : value;
}

function effective(state, key) {
  return { ...(state.entries?.[key] || {}), ...(state.cards?.[key] || {}) };
}

function placement(record = {}) {
  return Object.fromEntries(FIELDS.map(field => [field, short(record[field])]).filter(([, value]) => value !== undefined));
}

function differs(a = {}, b = {}) {
  return FIELDS.some(field => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
}

test('diagnostic: print live placement/image deltas against the historical 1:21 seed', async () => {
  const response = await fetch(`${BASE_URL}/api/catalogue-overrides?diagnostic=${Date.now()}`, { cache:'no-store' });
  assert.equal(response.ok, true, `live state GET failed with ${response.status}`);
  const live = await response.json();
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const seed = parseCatalogueSeed(html);

  const keys = [...new Set([
    ...Object.keys(seed.cards || {}),
    ...Object.keys(seed.entries || {}),
    ...Object.keys(live.cards || {}),
    ...Object.keys(live.entries || {})
  ])].sort();

  const deltas = [];
  for (const key of keys) {
    const historical = effective(seed, key);
    const current = effective(live, key);
    if (!Object.keys(historical).length || !Object.keys(current).length || !differs(historical, current)) continue;
    deltas.push({ key, historical:placement(historical), live:placement(current) });
  }

  const subsections = Array.isArray(live.sections?.recommendationSubsections)
    ? live.sections.recommendationSubsections.map(section => ({ id:section.id, entryKeys:section.entryKeys || [] }))
    : [];

  const tasterKeys = keys.filter(key => {
    const item = effective(live, key);
    return item.taster === true || String(item.catalogueType || '').toLowerCase() === 'taster';
  });
  const halfKeys = keys.filter(key => /half/i.test(String(effective(live, key).catalogueType || '')));

  console.log('LIVE_STATE_COUNTS', JSON.stringify({
    entries:Object.keys(live.entries || {}).length,
    cards:Object.keys(live.cards || {}).length,
    sections:Object.keys(live.sections || {}).length,
    historicalCards:Object.keys(seed.cards || {}).length,
    historicalEntries:Object.keys(seed.entries || {}).length
  }));
  console.log('LIVE_RECOMMENDATION_SUBSECTIONS', JSON.stringify(subsections));
  console.log('LIVE_TASTER_KEYS', JSON.stringify(tasterKeys));
  console.log('LIVE_HALF_KEYS', JSON.stringify(halfKeys));
  console.log('LIVE_PLACEMENT_IMAGE_DELTAS', JSON.stringify(deltas));
});
