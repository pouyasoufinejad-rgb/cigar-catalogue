#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseCatalogueSeed } from './cleanup-live-card-copy.mjs';
import { buildStructureContext, buildStructurePatch } from './normalise-live-card-structure.mjs';

export const TARGET_COMMIT = '8ba8f65754b37d5973331e55be0e9e9d5d306cf5';
export const ARTURITO_KEY = 'arturo-fuente-exquisitos-maduro';
export const ACID_KEY = 'drew-estate-acid-krush-red-cameroon';
export const ARTURITO_TITLE = 'Arturito';

const BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
const clone = value => JSON.parse(JSON.stringify(value ?? {}));

export const HISTORICAL_ACID_ENTRY = Object.freeze({
  brand:'Drew Estate',
  title:'ACID Krush Red Cameroon',
  eyebrow:'Sweet-tea infused Cameroon Coronet',
  packagePrice:14.8,
  packageLabel:'single cigar',
  price:14.8,
  country:'Nicaragua',
  length:4,
  ring:32,
  strength:5,
  quality:7,
  flavour:8,
  risk:1,
  stock:'in',
  subsection:'coronets-cigarillos',
  taster:false,
  catalogueType:'main',
  archived:false,
  size:'gold',
  experienceTags:['Nicotine: Medium','Pairings: Iced tea, coffee or cola','Occasion: Quick sweet aromatic smoke'],
  summaryHtml:'<strong>Sweet tea, aromatic herbs, mild Cameroon spice, earth and toasted nuttiness</strong> lead the profile. The infusion is sweet without becoming syrupy, while the Cameroon wrapper adds dry toast and gentle spice underneath. The 4×32 format concentrates the flavour into a quick, aromatic smoke with enough tobacco character to keep the sweetness balanced.',
  noteHtml:'Firmin Cigars currently lists the individual cigar at A$14.80.',
  productionLines:['Flavoured','Handmade','Wrapper: Cameroon','Binder: Nicaraguan','Filler: Nicaraguan'],
  practicalLines:['Single cigar','Uncut','Fragile','Lenient Cadence'],
  smokeTime:'About 15–25 min smoke',
  retailerLinks:['https://firmincigars.com.au/product-tag/drew-estate-cigars/?v=2c18c36508d1','https://www.cigarhut.com.au/acid-krush-red-cameroon/'],
  priceChecked:'2026-09-16',
  stockChecked:'2026-09-16'
});

function removeKeyFromRecommendationSubsections(sections, key) {
  const list = sections?.recommendationSubsections;
  if (!Array.isArray(list)) return;
  for (const section of list) {
    if (!Array.isArray(section?.entryKeys)) continue;
    section.entryKeys = section.entryKeys.filter(candidate => candidate !== key);
  }
}

function insertAcidIntoCoronets(sections) {
  const list = sections?.recommendationSubsections;
  if (!Array.isArray(list)) return;
  const coronets = list.find(section => section?.id === 'coronets-cigarillos');
  if (!coronets) throw new Error('The coronets-cigarillos subsection is missing.');
  coronets.entryKeys = Array.isArray(coronets.entryKeys) ? coronets.entryKeys : [];
  coronets.entryKeys.unshift(ACID_KEY);
}

function syncRecommendationRanks(state) {
  const list = state.sections?.recommendationSubsections;
  if (!Array.isArray(list)) return;
  for (const section of list) {
    const keys = Array.isArray(section?.entryKeys) ? section.entryKeys : [];
    keys.forEach((key, index) => {
      const rank = index + 1;
      state.cards[key] = { ...(state.cards[key] || {}), catalogueType:'main', taster:false, subsection:section.id, rank };
      if (state.entries[key]) state.entries[key] = { ...state.entries[key], taster:false, rank };
    });
  }
}

export function applyHistoricalStructureNormalisation(state, seed = {}) {
  const context = buildStructureContext(state, seed);
  const baseCards = seed?.cards && typeof seed.cards === 'object' ? seed.cards : {};
  const keys = new Set([...Object.keys(baseCards), ...Object.keys(state.entries || {}), ...Object.keys(state.cards || {})]);
  for (const key of keys) {
    const patch = buildStructurePatch(state.cards?.[key], state.entries?.[key], baseCards[key], context, key);
    if (!Object.keys(patch).length) continue;
    state.cards[key] = { ...(state.cards[key] || {}), ...clone(patch) };
    if (state.entries[key]) state.entries[key] = { ...state.entries[key], ...clone(patch) };
  }
  return state;
}

export function buildPreSidebarState({ current, acidEntry = HISTORICAL_ACID_ENTRY, seed = null }) {
  const state = clone(current);
  state.version = 3;
  state.cards = state.cards || {};
  state.entries = state.entries || {};
  state.sections = state.sections || {};

  delete state.sections.brandLogos;
  delete state.sections.hiddenBrands;

  const restoredAcid = { ...clone(acidEntry), key:ACID_KEY, archived:false, taster:false, catalogueType:'main' };
  state.entries[ACID_KEY] = { ...(state.entries[ACID_KEY] || {}), ...restoredAcid };
  state.cards[ACID_KEY] = { ...(state.cards[ACID_KEY] || {}), ...clone(acidEntry), archived:false, taster:false, catalogueType:'main' };

  state.cards[ARTURITO_KEY] = { ...(state.cards[ARTURITO_KEY] || {}), title:ARTURITO_TITLE };
  if (state.entries[ARTURITO_KEY]) state.entries[ARTURITO_KEY] = { ...state.entries[ARTURITO_KEY], title:ARTURITO_TITLE };

  removeKeyFromRecommendationSubsections(state.sections, ACID_KEY);
  insertAcidIntoCoronets(state.sections);
  syncRecommendationRanks(state);

  if (seed) applyHistoricalStructureNormalisation(state, seed);

  for (const card of Object.values(state.cards)) if (card && typeof card === 'object') delete card.value;
  for (const entry of Object.values(state.entries)) if (entry && typeof entry === 'object') delete entry.value;
  delete state.updatedAt;
  return state;
}

function assertRestored(state) {
  assert.equal(state.sections?.brandLogos, undefined, 'Sidebar brand logo state must be absent.');
  assert.equal(state.sections?.hiddenBrands, undefined, 'Sidebar hidden-brand state must be absent.');
  assert.match(String(state.cards?.[ARTURITO_KEY]?.title || state.entries?.[ARTURITO_KEY]?.title || ''), /Arturito/i, 'Arturito fingerprint is missing.');
  assert.equal(state.entries?.[ACID_KEY]?.title, 'ACID Krush Red Cameroon', 'ACID entry is missing.');
  assert.equal(state.cards?.[ACID_KEY]?.catalogueType, 'main', 'ACID card must be main catalogue.');
  const coronets = state.sections?.recommendationSubsections?.find?.(section => section?.id === 'coronets-cigarillos');
  assert.ok(coronets?.entryKeys?.includes?.(ACID_KEY), 'ACID must be in Coronets & Cigarillos.');
  for (const card of Object.values(state.cards || {})) assert.equal(card?.value, undefined, 'Stored Value fields must be absent.');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache:'no-store', ...options });
  const body = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : {};
}

function authHeaders(token, extra = {}) {
  return { ...extra, authorization:`Bearer ${token}` };
}

async function main() {
  const mode = process.argv[2] || '--dry-run-live';
  if (!['--dry-run-live','--apply'].includes(mode)) throw new Error('Use --dry-run-live or --apply.');

  const current = await fetchJson(`${BASE_URL}/api/catalogue-overrides?pre_sidebar_restore=${Date.now()}`);
  const html = await readFile(resolve(process.cwd(), 'public/index.html'), 'utf8');
  const seed = parseCatalogueSeed(html);
  const restored = buildPreSidebarState({ current, seed });
  assertRestored(restored);

  console.log('ROLLBACK_TARGET', TARGET_COMMIT);
  console.log('CURRENT_COUNTS', JSON.stringify({ entries:Object.keys(current.entries || {}).length, cards:Object.keys(current.cards || {}).length, sections:Object.keys(current.sections || {}).length }));
  console.log('RESTORED_COUNTS', JSON.stringify({ entries:Object.keys(restored.entries || {}).length, cards:Object.keys(restored.cards || {}).length, sections:Object.keys(restored.sections || {}).length }));
  console.log('ARTURITO_TITLE', restored.cards?.[ARTURITO_KEY]?.title || restored.entries?.[ARTURITO_KEY]?.title);
  console.log('PRE_SIDEBAR_DRY_RUN_OK');
  if (mode !== '--apply') return;

  const token = String(process.env.CATALOGUE_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required.');
  await fetchJson(`${BASE_URL}/api/catalogue-overrides`, {
    method:'PUT',
    headers:authHeaders(token, { 'content-type':'application/json' }),
    body:JSON.stringify({ version:3, cards:restored.cards, sections:restored.sections, entries:restored.entries })
  });

  const verified = await fetchJson(`${BASE_URL}/api/catalogue-overrides?pre_sidebar_verify=${Date.now()}`);
  assertRestored(verified);
  assert.deepEqual(Object.keys(verified.entries || {}).sort(), Object.keys(restored.entries || {}).sort());

  const renderedResponse = await fetch(`${BASE_URL}/?pre_sidebar_verify=${Date.now()}`, { cache:'no-store' });
  const rendered = await renderedResponse.text();
  if (!renderedResponse.ok) throw new Error(`Production render verification failed with HTTP ${renderedResponse.status}.`);
  if (!/Arturito/i.test(rendered)) throw new Error('Rendered catalogue does not contain Arturito.');
  if (!rendered.includes(`data-key="${ACID_KEY}"`)) throw new Error('Rendered catalogue does not contain ACID Krush Red Cameroon.');

  console.log('PRE_SIDEBAR_APPLY_VERIFIED');
}

if (process.argv[1]?.endsWith('restore-pre-sidebar-arturito.mjs')) {
  main().catch(error => { console.error(`Pre-sidebar rollback failed: ${error.stack || error.message}`); process.exitCode = 1; });
}
