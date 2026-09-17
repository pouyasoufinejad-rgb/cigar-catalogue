#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
const IMAGE_VERSION = 'recovery-20260918';
const clone = value => JSON.parse(JSON.stringify(value ?? {}));

export const TASTER_REPAIRS = Object.freeze([
  Object.freeze({ key:'liga-privada-h99-papas-fritas', rank:8 }),
  Object.freeze({ key:'nica-rustica-broadleaf-short-robusto', rank:9 }),
  Object.freeze({ key:'liga-privada-unico-papas-fritas', rank:10 }),
  Object.freeze({ key:'liga-privada-unico-nasty-fritas', rank:11 }),
  Object.freeze({ key:'undercrown-10-corona-viva', rank:12 })
]);

export const VERIFIED_IMAGE_KEYS = Object.freeze([
  'liga-privada-h99-coronets',
  'liga-privada-10-seleccion-de-mercado-coronets',
  'undercrown-10-coronets',
  'liga-privada-unico-nasty-fritas',
  'undercrown-10-corona-viva',
  'liga-privada-h99-papas-fritas',
  'la-flor-dominicana-reserva-especial-el-jocko-maduro',
  'la-flor-dominicana-la-nox-petit',
  'my-father-la-gran-oferta-lancero',
  'foundation-charter-oak-maduro-rothschild',
  'paradiso-quintessence-robusto',
  'ashton-vsg-enchantment',
  'drew-estate-acid-krush-red-cameroon',
  'arturo-fuente-exquisitos-maduro',
  'ashton-aged-maduro-esquire',
  'isla-del-sol-maduro-coronets',
  'kfc-ponies',
  'tabernacle-broadleaf-corona'
]);

const tasterKeys = new Set(TASTER_REPAIRS.map(item => item.key));

function patchRecord(record, patch, deletes = []) {
  if (!record || typeof record !== 'object') return record;
  const next = { ...record, ...patch };
  for (const field of deletes) delete next[field];
  return next;
}

function setTaster(state, key, rank) {
  const patch = { catalogueType:'taster', taster:true, rank };
  if (state.cards?.[key]) state.cards[key] = patchRecord(state.cards[key], patch, ['subsection']);
  if (state.entries?.[key]) state.entries[key] = patchRecord(state.entries[key], patch, ['subsection']);
}

function compactChangedRecommendationSubsections(state) {
  const list = state.sections?.recommendationSubsections;
  if (!Array.isArray(list)) return;
  for (const section of list) {
    if (!Array.isArray(section?.entryKeys)) continue;
    const filtered = section.entryKeys.filter(key => !tasterKeys.has(key));
    if (filtered.length === section.entryKeys.length) continue;
    section.entryKeys = filtered;
    filtered.forEach((key, index) => {
      const patch = { rank:index + 1 };
      if (state.cards?.[key]) state.cards[key] = patchRecord(state.cards[key], patch);
      if (state.entries?.[key]) state.entries[key] = patchRecord(state.entries[key], patch);
    });
  }
}

export function applyVerifiedPlacementImageRepair(input, options = {}) {
  const state = clone(input);
  state.cards ||= {};
  state.entries ||= {};
  state.sections ||= {};

  for (const { key, rank } of TASTER_REPAIRS) setTaster(state, key, rank);
  compactChangedRecommendationSubsections(state);

  const imageKeys = options.verifiedImageKeys || VERIFIED_IMAGE_KEYS;
  for (const key of imageKeys) {
    const card = state.cards?.[key];
    if (!card || String(card.imageUrl || '').trim()) continue;
    state.cards[key] = { ...card, imageUrl:`/api/catalogue-image/${key}?v=${IMAGE_VERSION}` };
  }
  return state;
}

function keySet(object) {
  return Object.keys(object || {}).sort();
}

export function assertPreservedShape(before, after) {
  assert.deepEqual(keySet(after.cards), keySet(before.cards), 'Repair must preserve the card key set.');
  assert.deepEqual(keySet(after.entries), keySet(before.entries), 'Repair must preserve the entry key set.');
  assert.deepEqual(keySet(after.sections), keySet(before.sections), 'Repair must preserve top-level section keys.');
  assert.equal(after.version, before.version, 'Repair must preserve state version.');
}

export function assertRepair(state, verifiedImageKeys = VERIFIED_IMAGE_KEYS) {
  const subsections = state.sections?.recommendationSubsections || [];
  for (const { key, rank } of TASTER_REPAIRS) {
    const card = state.cards?.[key];
    assert.equal(card?.catalogueType, 'taster', `${key} must be a Taster.`);
    assert.equal(card?.taster, true, `${key} must have taster=true.`);
    assert.equal(card?.rank, rank, `${key} must have Taster rank ${rank}.`);
    assert.equal('subsection' in (card || {}), false, `${key} must not retain a recommendation subsection.`);
    assert.equal(subsections.some(section => section?.entryKeys?.includes?.(key)), false, `${key} must not be a recommendation member.`);
    if (state.entries?.[key]) {
      assert.equal(state.entries[key].catalogueType, 'taster', `${key} entry must be a Taster.`);
      assert.equal(state.entries[key].taster, true, `${key} entry must have taster=true.`);
      assert.equal(state.entries[key].rank, rank, `${key} entry must have Taster rank ${rank}.`);
      assert.equal('subsection' in state.entries[key], false, `${key} entry must not retain a recommendation subsection.`);
    }
  }
  for (const section of subsections) {
    (section.entryKeys || []).forEach((key, index) => {
      if (state.cards?.[key]) assert.equal(state.cards[key].rank, index + 1, `${key} main rank must match subsection order.`);
    });
  }
  for (const key of verifiedImageKeys) {
    if (!state.cards?.[key]) continue;
    assert.ok(String(state.cards[key].imageUrl || '').trim(), `${key} must retain a verified image reference.`);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache:'no-store', ...options });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function currentlyVerifiedImageKeys(state) {
  const output = [];
  for (const key of VERIFIED_IMAGE_KEYS) {
    if (!state.cards?.[key]) continue;
    if (String(state.cards[key].imageUrl || '').trim()) {
      output.push(key);
      continue;
    }
    const response = await fetch(`${BASE_URL}/api/catalogue-image/${encodeURIComponent(key)}?repair_preflight=${Date.now()}`, { cache:'no-store' });
    if (response.ok && /^image\//i.test(response.headers.get('content-type') || '')) output.push(key);
  }
  return output;
}

function describeChanges(before, after) {
  const changes = [];
  for (const key of new Set([...Object.keys(before.cards || {}), ...Object.keys(after.cards || {})])) {
    const a = before.cards?.[key] || {};
    const b = after.cards?.[key] || {};
    for (const field of ['catalogueType','taster','subsection','rank','imageUrl']) {
      if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) changes.push({ scope:'cards', key, field, before:a[field] ?? null, after:b[field] ?? null });
    }
  }
  for (const key of new Set([...Object.keys(before.entries || {}), ...Object.keys(after.entries || {})])) {
    const a = before.entries?.[key] || {};
    const b = after.entries?.[key] || {};
    for (const field of ['catalogueType','taster','subsection','rank']) {
      if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) changes.push({ scope:'entries', key, field, before:a[field] ?? null, after:b[field] ?? null });
    }
  }
  const aSections = before.sections?.recommendationSubsections || [];
  const bSections = after.sections?.recommendationSubsections || [];
  if (JSON.stringify(aSections) !== JSON.stringify(bSections)) changes.push({ scope:'sections', field:'recommendationSubsections', before:aSections, after:bSections });
  return changes;
}

async function main() {
  const mode = process.argv[2] || '--dry-run-live';
  if (!['--dry-run-live','--apply'].includes(mode)) throw new Error('Use --dry-run-live or --apply.');
  const current = await fetchJson(`${BASE_URL}/api/catalogue-overrides?placement_image_repair=${Date.now()}`);
  const verifiedImageKeys = await currentlyVerifiedImageKeys(current);
  const repaired = applyVerifiedPlacementImageRepair(current, { verifiedImageKeys });
  assertPreservedShape(current, repaired);
  assertRepair(repaired, verifiedImageKeys);
  const changes = describeChanges(current, repaired);
  console.log('VERIFIED_IMAGE_KEYS', JSON.stringify(verifiedImageKeys));
  console.log('REPAIR_CHANGES', JSON.stringify(changes));
  console.log('REPAIR_COUNTS', JSON.stringify({ entries:Object.keys(repaired.entries || {}).length, cards:Object.keys(repaired.cards || {}).length, sections:Object.keys(repaired.sections || {}).length }));
  if (mode === '--dry-run-live') {
    console.log('PLACEMENT_IMAGE_REPAIR_DRY_RUN_OK');
    return;
  }

  const token = String(process.env.CATALOGUE_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for --apply.');
  await fetchJson(`${BASE_URL}/api/catalogue-overrides`, {
    method:'PUT',
    headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
    body:JSON.stringify({ version:repaired.version, cards:repaired.cards, sections:repaired.sections, entries:repaired.entries })
  });
  const verified = await fetchJson(`${BASE_URL}/api/catalogue-overrides?placement_image_verify=${Date.now()}`);
  assertPreservedShape(repaired, verified);
  assertRepair(verified, verifiedImageKeys);
  console.log('PLACEMENT_IMAGE_REPAIR_APPLY_VERIFIED');
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked && invoked === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Placement/image repair failed: ${error.stack || error.message}`); process.exitCode = 1; });
}
