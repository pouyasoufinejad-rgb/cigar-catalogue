#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
const IMAGE_VERSION = 'recovery-20260918';
const clone = value => JSON.parse(JSON.stringify(value ?? {}));

export const TASTER_REPAIRS = Object.freeze([
  Object.freeze({ key:'nica-rustica-broadleaf-short-robusto', rank:8 }),
  Object.freeze({ key:'liga-privada-unico-papas-fritas', rank:9 })
]);

export const PETIT_REPAIRS = Object.freeze([
  Object.freeze({ key:'liga-privada-h99-papas-fritas', rank:10 }),
  Object.freeze({ key:'liga-privada-unico-nasty-fritas', rank:11 }),
  Object.freeze({ key:'undercrown-10-corona-viva', rank:13 })
]);

export const ACID_REPAIR = Object.freeze({
  key:'drew-estate-acid-krush-red-cameroon',
  subsection:'coronets-cigarillos',
  rank:20
});

// The exact generated catalogue asset was lost from KV during the Sep 17 corruption.
// This verified product image is used only to restore the missing same-product image blob.
export const ACID_IMAGE_SOURCE_URL = 'https://cdn11.bigcommerce.com/s-1a5b5/images/stencil/1280x1280/products/80/54080/acid-krush-red__73052.1691781200.jpg?c=2';

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
  ACID_REPAIR.key,
  'arturo-fuente-exquisitos-maduro',
  'ashton-aged-maduro-esquire',
  'isla-del-sol-maduro-coronets',
  'kfc-ponies',
  'tabernacle-broadleaf-corona'
]);

const repairedKeys = new Set([
  ...TASTER_REPAIRS.map(item => item.key),
  ...PETIT_REPAIRS.map(item => item.key),
  ACID_REPAIR.key
]);

function patchRecord(record, patch, deletes = []) {
  if (!record || typeof record !== 'object') return record;
  const next = { ...record, ...patch };
  for (const field of deletes) delete next[field];
  return next;
}

function subsection(state, id) {
  return (state.sections?.recommendationSubsections || []).find(section => section?.id === id) || null;
}

function removeRepairKeysFromRecommendationSubsections(state) {
  const list = state.sections?.recommendationSubsections;
  if (!Array.isArray(list)) return;
  for (const section of list) {
    if (!Array.isArray(section?.entryKeys)) continue;
    section.entryKeys = section.entryKeys.filter(key => !repairedKeys.has(key));
  }
}

function insertAtRank(section, key, rank) {
  if (!section) throw new Error(`Required recommendation subsection is missing for ${key}.`);
  section.entryKeys = Array.isArray(section.entryKeys) ? section.entryKeys : [];
  const index = Math.max(0, Math.min(section.entryKeys.length, Number(rank) - 1));
  section.entryKeys.splice(index, 0, key);
}

function syncRecommendationRanks(state) {
  const list = state.sections?.recommendationSubsections;
  if (!Array.isArray(list)) return;
  for (const section of list) {
    const keys = Array.isArray(section?.entryKeys) ? section.entryKeys : [];
    keys.forEach((key, index) => {
      if (state.cards?.[key]) {
        state.cards[key] = patchRecord(state.cards[key], {
          catalogueType:'main',
          taster:false,
          subsection:section.id,
          rank:index + 1
        });
      }
      if (state.entries?.[key]) {
        state.entries[key] = patchRecord(state.entries[key], { taster:false, rank:index + 1 }, ['catalogueType','subsection']);
      }
    });
  }
}

function setTaster(state, key, rank) {
  if (state.cards?.[key]) {
    state.cards[key] = patchRecord(state.cards[key], { catalogueType:'taster', taster:true, rank }, ['subsection']);
  }
  if (state.entries?.[key]) {
    state.entries[key] = patchRecord(state.entries[key], { taster:true, rank }, ['catalogueType','subsection']);
  }
}

function compactTasters(state) {
  const cohort = Object.entries(state.cards || {})
    .filter(([, card]) => !card?.archived && (String(card?.catalogueType || '').toLowerCase() === 'taster' || card?.taster === true))
    .sort((a, b) => Number(a[1]?.rank || Number.MAX_SAFE_INTEGER) - Number(b[1]?.rank || Number.MAX_SAFE_INTEGER));
  cohort.forEach(([key], index) => setTaster(state, key, index + 1));
}

function restorePlacements(state) {
  removeRepairKeysFromRecommendationSubsections(state);

  const petit = subsection(state, 'petit-panatelas');
  for (const { key, rank } of PETIT_REPAIRS) insertAtRank(petit, key, rank);

  const coronets = subsection(state, ACID_REPAIR.subsection);
  insertAtRank(coronets, ACID_REPAIR.key, ACID_REPAIR.rank);

  syncRecommendationRanks(state);
  compactTasters(state);
}

export function applyVerifiedPlacementImageRepair(input, options = {}) {
  const state = clone(input);
  state.cards ||= {};
  state.entries ||= {};
  state.sections ||= {};

  restorePlacements(state);

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
  const petit = subsection(state, 'petit-panatelas');
  const coronets = subsection(state, ACID_REPAIR.subsection);

  for (const { key, rank } of PETIT_REPAIRS) {
    const card = state.cards?.[key];
    assert.equal(petit?.entryKeys?.[rank - 1], key, `${key} must be Petit rank ${rank}.`);
    assert.equal(card?.catalogueType, 'main', `${key} must be main.`);
    assert.equal(card?.taster, false, `${key} must not be a Taster.`);
    assert.equal(card?.subsection, 'petit-panatelas', `${key} must be in Petit.`);
    assert.equal(card?.rank, rank, `${key} must have Petit rank ${rank}.`);
    if (state.entries?.[key]) {
      assert.equal(state.entries[key].taster, false, `${key} entry must not be a Taster.`);
      assert.equal(state.entries[key].rank, rank, `${key} entry rank must mirror Petit rank.`);
    }
  }

  for (const { key, rank } of TASTER_REPAIRS) {
    const card = state.cards?.[key];
    assert.equal(card?.catalogueType, 'taster', `${key} must be a Taster.`);
    assert.equal(card?.taster, true, `${key} must have taster=true.`);
    assert.equal(card?.rank, rank, `${key} must have Taster rank ${rank}.`);
    assert.equal('subsection' in (card || {}), false, `${key} must not retain a recommendation subsection.`);
    assert.equal(subsections.some(section => section?.entryKeys?.includes?.(key)), false, `${key} must not be a recommendation member.`);
    if (state.entries?.[key]) {
      assert.equal(state.entries[key].taster, true, `${key} entry must have taster=true.`);
      assert.equal(state.entries[key].rank, rank, `${key} entry must have Taster rank ${rank}.`);
    }
  }

  const acid = state.cards?.[ACID_REPAIR.key];
  assert.equal(coronets?.entryKeys?.[ACID_REPAIR.rank - 1], ACID_REPAIR.key, `ACID must be Coronet rank ${ACID_REPAIR.rank}.`);
  assert.equal(acid?.catalogueType, 'main', 'ACID must remain a main catalogue card.');
  assert.equal(acid?.taster, false, 'ACID must not be a Taster.');
  assert.equal(acid?.subsection, ACID_REPAIR.subsection, 'ACID must remain in Coronets.');
  assert.equal(acid?.rank, ACID_REPAIR.rank, `ACID must be rank ${ACID_REPAIR.rank}.`);
  if (state.entries?.[ACID_REPAIR.key]) assert.equal(state.entries[ACID_REPAIR.key].rank, ACID_REPAIR.rank, 'ACID entry rank must mirror the subsection rank.');

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

async function imageBlobExists(key) {
  const response = await fetch(`${BASE_URL}/api/catalogue-image/${encodeURIComponent(key)}?repair_preflight=${Date.now()}`, { cache:'no-store' });
  return response.ok && /^image\//i.test(response.headers.get('content-type') || '');
}

async function currentlyVerifiedImageKeys(state) {
  const output = [];
  for (const key of VERIFIED_IMAGE_KEYS) {
    if (!state.cards?.[key] || key === ACID_REPAIR.key) continue;
    if (await imageBlobExists(key)) output.push(key);
  }
  return output;
}

async function fetchAcidSourceImage() {
  const response = await fetch(ACID_IMAGE_SOURCE_URL, { cache:'no-store', headers:{ 'user-agent':'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`ACID image source failed with HTTP ${response.status}.`);
  const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg','image/png','image/webp'].includes(mimeType)) throw new Error(`ACID image source returned ${mimeType || 'unknown content type'}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('ACID image source returned an empty file.');
  return { bytes, mimeType };
}

async function ensureAcidImage(mode, token = '') {
  if (await imageBlobExists(ACID_REPAIR.key)) return true;
  const source = await fetchAcidSourceImage();
  console.log('ACID_IMAGE_SOURCE_READY', JSON.stringify({ bytes:source.bytes.length, mimeType:source.mimeType }));
  if (mode !== '--apply') return true;
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required to restore the ACID image.');

  const endpoint = `${BASE_URL}/api/catalogue-image/${encodeURIComponent(ACID_REPAIR.key)}`;
  const upload = await fetch(endpoint, {
    method:'PUT',
    headers:{ 'content-type':source.mimeType, authorization:`Bearer ${token}` },
    body:source.bytes
  });
  if (!upload.ok) throw new Error(`ACID image upload failed with HTTP ${upload.status}: ${(await upload.text()).slice(0, 300)}`);

  const check = await fetch(`${endpoint}?repair_verify=${Date.now()}`, { cache:'no-store' });
  if (!check.ok || !/^image\//i.test(check.headers.get('content-type') || '')) throw new Error(`ACID image verification failed with HTTP ${check.status}.`);
  const downloaded = Buffer.from(await check.arrayBuffer());
  if (!downloaded.equals(source.bytes)) throw new Error('ACID image verification bytes do not match the uploaded image.');
  console.log('ACID_IMAGE_UPLOAD_VERIFIED');
  return true;
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
    for (const field of ['taster','subsection','rank']) {
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
  const token = mode === '--apply' ? String(process.env.CATALOGUE_ADMIN_TOKEN || '').trim() : '';
  if (mode === '--apply' && !token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for --apply.');

  const verifiedImageKeys = await currentlyVerifiedImageKeys(current);
  if (await ensureAcidImage(mode, token)) verifiedImageKeys.push(ACID_REPAIR.key);

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

  await fetchJson(`${BASE_URL}/api/catalogue-overrides`, {
    method:'PUT',
    headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
    body:JSON.stringify({ version:repaired.version, cards:repaired.cards, sections:repaired.sections, entries:repaired.entries })
  });
  const verified = await fetchJson(`${BASE_URL}/api/catalogue-overrides?placement_image_verify=${Date.now()}`);
  assertPreservedShape(repaired, verified);
  assertRepair(verified, verifiedImageKeys);
  if (!(await imageBlobExists(ACID_REPAIR.key))) throw new Error('ACID image blob is missing after catalogue write.');
  console.log('PLACEMENT_IMAGE_REPAIR_APPLY_VERIFIED');
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked && invoked === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Placement/image repair failed: ${error.stack || error.message}`); process.exitCode = 1; });
}
