import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCatalogueSeed } from '../scripts/cleanup-live-card-copy.mjs';

const BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
const FIELDS = ['catalogueType','taster','subsection','rank','tasterRank','halfRank','imageUrl','imageSourceKey','imageVersion','archived'];

function short(value) {
  if (typeof value !== 'string') return value;
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}

function effective(state, key) {
  return { ...(state.entries?.[key] || {}), ...(state.cards?.[key] || {}) };
}

function picked(record = {}) {
  return Object.fromEntries(FIELDS.map(field => [field, short(record[field])]).filter(([, value]) => value !== undefined));
}

function differs(a = {}, b = {}) {
  return FIELDS.some(field => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
}

function normaliseKey(value) {
  return String(value || '').trim().replace(/^catalogue-image:/, '').replace(/^\/api\/catalogue-image\//, '').split('?')[0];
}

test('diagnostic: print live placement/image state against the historical 1:21 seed', async () => {
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
    deltas.push({ key, historical:picked(historical), live:picked(current) });
  }

  const subsections = Array.isArray(live.sections?.recommendationSubsections)
    ? live.sections.recommendationSubsections.map(section => ({ id:section.id, entryKeys:section.entryKeys || [] }))
    : [];

  const tasterRecords = keys.map(key => ({ key, ...effective(live, key) }))
    .filter(item => item.taster === true || String(item.catalogueType || '').toLowerCase() === 'taster')
    .map(item => ({ key:item.key, title:item.title, ...picked(item) }));

  const halfRecords = keys.map(key => ({ key, ...effective(live, key) }))
    .filter(item => /half/i.test(String(item.catalogueType || '')))
    .map(item => ({ key:item.key, title:item.title, ...picked(item) }));

  const imageRecords = keys.map(key => ({ key, ...effective(live, key) }))
    .filter(item => item.imageUrl !== undefined || item.imageSourceKey !== undefined || item.imageVersion !== undefined)
    .map(item => ({ key:item.key, title:item.title, ...picked(item) }));

  const imageSourceMismatches = imageRecords.filter(item => {
    const source = normaliseKey(item.imageSourceKey || item.imageUrl);
    return source && source !== item.key && !source.startsWith('brand-logo-') && !/^https?:/i.test(source);
  });

  const sourceKeys = [...new Set(imageRecords.map(item => normaliseKey(item.imageSourceKey)).filter(Boolean))];
  const imageEndpointChecks = await Promise.all(sourceKeys.map(async sourceKey => {
    const imageResponse = await fetch(`${BASE_URL}/api/catalogue-image/${encodeURIComponent(sourceKey)}?diagnostic=${Date.now()}`, { cache:'no-store' });
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    return {
      sourceKey,
      status:imageResponse.status,
      contentType:imageResponse.headers.get('content-type'),
      contentLength:Number(imageResponse.headers.get('content-length') || bytes.byteLength),
      signature:Array.from(bytes.slice(0, 12))
    };
  }));

  console.log('LIVE_STATE_COUNTS', JSON.stringify({
    entries:Object.keys(live.entries || {}).length,
    cards:Object.keys(live.cards || {}).length,
    sections:Object.keys(live.sections || {}).length,
    historicalCards:Object.keys(seed.cards || {}).length,
    historicalEntries:Object.keys(seed.entries || {}).length
  }));
  console.log('LIVE_RECOMMENDATION_SUBSECTIONS', JSON.stringify(subsections));
  console.log('LIVE_TASTER_RECORDS', JSON.stringify(tasterRecords));
  console.log('LIVE_HALF_RECORDS', JSON.stringify(halfRecords));
  console.log('LIVE_IMAGE_RECORDS', JSON.stringify(imageRecords));
  console.log('LIVE_IMAGE_SOURCE_MISMATCHES', JSON.stringify(imageSourceMismatches));
  console.log('LIVE_IMAGE_ENDPOINT_CHECKS', JSON.stringify(imageEndpointChecks));
  console.log('LIVE_PLACEMENT_IMAGE_DELTAS', JSON.stringify(deltas));
});
