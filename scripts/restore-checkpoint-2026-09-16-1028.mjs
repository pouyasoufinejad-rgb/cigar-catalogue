#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

export const TARGET_COMMIT = '287f7fc5e2e612463f09a91bf59cc9ad7d8e5dc9';
export const POST_TARGET_KEY = 'drew-estate-acid-krush-red-cameroon';
export const TARGET_ADDITION_KEYS = Object.freeze([
  'la-flor-dominicana-reserva-especial-el-jocko-maduro',
  'la-flor-dominicana-la-nox-petit',
  'my-father-la-gran-oferta-lancero',
  'my-father-no-4-lancero',
  'foundation-charter-oak-maduro-rothschild',
  'paradiso-quintessence-robusto',
  'ashton-vsg-enchantment',
  'paradiso-elegancia-corona'
]);

const BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
const CARD_FIELDS = new Set([
  'archived','archivedAt','archivedRank','archivedSubsection','subsection','stockPin','rank','strength','quality','flavour','size','laurel',
  'experienceTags','eyebrow','summaryHtml','noteHtml','brand','title','packagePrice','packageLabel','price','country','length','ring','risk','taster',
  'catalogueType','retailerLinks','imageUrl','smokeTime'
]);
const ENTRY_FIELDS = new Set([
  'brand','title','eyebrow','packagePrice','packageLabel','price','length','ring','country','strength','quality','size','risk','stock','stockPin','rank',
  'taster','archived','archivedAt','experienceTags','summaryHtml','noteHtml','productionLines','practicalLines','smokeTime','retailerLinks','imageUrl',
  'imageSourceKey','imageVersion','priceChecked','stockChecked'
]);

const clone = value => JSON.parse(JSON.stringify(value ?? {}));

function cleanEntryPatch(entry = {}) {
  const output = {};
  for (const [key, value] of Object.entries(entry || {})) if (ENTRY_FIELDS.has(key)) output[key] = clone(value);
  return output;
}

function cleanCardPatch(entry = {}) {
  const output = {};
  for (const [key, value] of Object.entries(entry || {})) if (CARD_FIELDS.has(key) && key !== 'imageUrl') output[key] = clone(value);
  if (Array.isArray(entry.productionLines)) output.productionHtml = linesToMarkup(entry.productionLines);
  if (Array.isArray(entry.practicalLines)) output.practicalHtml = linesToMarkup(entry.practicalLines);
  return output;
}

export function linesToMarkup(lines = []) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;' }[char]));
  return Array.isArray(lines) ? lines.map(line => `<span class="artmeta-line">${escape(line)}</span>`).join('') : '';
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] || '';
}

function extractMetaLines(body, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inner = body.match(new RegExp(`<[^>]*class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))?.[1] || '';
  return Array.from(inner.matchAll(/<span\b[^>]*class=["'][^"']*artmeta-line[^"']*["'][^>]*>[\s\S]*?<\/span>/gi), match => match[0]).join('');
}

export function parseStaticMeta(targetHtml = '') {
  const output = {};
  for (const match of String(targetHtml).matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)) {
    const tag = `<article${match[1]}>`;
    const key = attr(tag, 'data-key');
    if (!key) continue;
    const productionHtml = extractMetaLines(match[2], 'artmeta-left');
    const practicalHtml = extractMetaLines(match[2], 'artmeta-right');
    if (productionHtml || practicalHtml) output[key] = { productionHtml, practicalHtml };
  }
  return output;
}

function requestMap(targetRequests = []) {
  const map = new Map();
  for (const request of targetRequests) {
    if (!request || request.operation !== 'upsert-entry' || !request.key || !request.entry) continue;
    const previous = map.get(request.key) || {};
    map.set(request.key, { ...previous, ...clone(request.entry) });
  }
  return map;
}

function sectionIdFor(entry = {}) {
  if (Array.isArray(entry.productionLines) && entry.productionLines.some(line => String(line).trim().toLowerCase() === 'flavoured')) return 'flavoured-infused';
  return Number(entry.ring) >= 35 ? 'petit-panatelas' : 'coronets-cigarillos';
}

function stripFromSubsections(sections, keys) {
  if (!Array.isArray(sections.recommendationSubsections)) return;
  const remove = new Set(keys);
  for (const section of sections.recommendationSubsections) {
    if (!Array.isArray(section.entryKeys)) continue;
    section.entryKeys = section.entryKeys.filter(key => !remove.has(key));
  }
}

function insertTargetAdditions(sections, additions) {
  if (!Array.isArray(sections.recommendationSubsections)) return;
  for (const { key, entry } of additions) {
    const id = sectionIdFor(entry);
    const section = sections.recommendationSubsections.find(item => item?.id === id);
    if (!section) throw new Error(`Target subsection ${id} is missing.`);
    section.entryKeys = Array.isArray(section.entryKeys) ? section.entryKeys : [];
    section.entryKeys.unshift(key);
  }
}

function syncRecommendationRanks(state) {
  if (!Array.isArray(state.sections?.recommendationSubsections)) return;
  for (const section of state.sections.recommendationSubsections) {
    const keys = Array.isArray(section.entryKeys) ? section.entryKeys : [];
    keys.forEach((key, index) => {
      state.cards[key] = { ...(state.cards[key] || {}), catalogueType:'main', taster:false, subsection:section.id, rank:index + 1 };
      if (state.entries[key]) {
        state.entries[key].taster = false;
        state.entries[key].rank = index + 1;
      }
    });
  }
}

export function buildCheckpointState({ current, targetRequests = [], targetHtml = '' }) {
  const state = clone(current);
  state.version = 3;
  state.cards = state.cards || {};
  state.entries = state.entries || {};
  state.sections = state.sections || {};

  delete state.entries[POST_TARGET_KEY];
  delete state.cards[POST_TARGET_KEY];
  delete state.sections.brandLogos;
  delete state.sections.hiddenBrands;

  const requests = requestMap(targetRequests);
  const staticMeta = parseStaticMeta(targetHtml);

  // Undo the later whole-catalogue Production/Practical normaliser.
  for (const [key, meta] of Object.entries(staticMeta)) {
    if (!state.cards[key]) continue;
    state.cards[key] = { ...state.cards[key], ...meta };
  }
  for (const [key, entry] of Object.entries(state.entries)) {
    const source = requests.get(key);
    if (!source) continue;
    if (Array.isArray(source.productionLines)) entry.productionLines = clone(source.productionLines);
    if (Array.isArray(source.practicalLines)) entry.practicalLines = clone(source.practicalLines);
    if (state.cards[key]) {
      if (Array.isArray(source.productionLines)) state.cards[key].productionHtml = linesToMarkup(source.productionLines);
      if (Array.isArray(source.practicalLines)) state.cards[key].practicalHtml = linesToMarkup(source.practicalLines);
    }
  }

  const additions = TARGET_ADDITION_KEYS.map(key => {
    const source = requests.get(key);
    if (!source) throw new Error(`Target request is missing for ${key}.`);
    const entry = { ...cleanEntryPatch(source), key };
    // The checkpoint was immediately after publication of these requests, before later image recovery.
    delete entry.imageUrl;
    delete entry.imageSourceKey;
    delete entry.imageVersion;
    state.entries[key] = { ...state.entries[key], ...entry, key, archived:false };
    state.cards[key] = { ...state.cards[key], ...cleanCardPatch(source), catalogueType:'main', taster:false, archived:false };
    delete state.cards[key].imageUrl;
    delete state.cards[key].imageSourceKey;
    delete state.cards[key].imageVersion;
    delete state.cards[key].archivedRank;
    delete state.cards[key].archivedSubsection;
    return { key, entry:source };
  });

  stripFromSubsections(state.sections, [POST_TARGET_KEY, ...TARGET_ADDITION_KEYS]);
  insertTargetAdditions(state.sections, additions);
  syncRecommendationRanks(state);

  for (const card of Object.values(state.cards)) if (card && typeof card === 'object') delete card.value;
  delete state.updatedAt;
  return state;
}

function gitText(args) {
  return execFileSync('git', args, { encoding:'utf8', maxBuffer:32 * 1024 * 1024 });
}

export function loadTargetSources() {
  const targetHtml = gitText(['show', `${TARGET_COMMIT}:public/index.html`]);
  const paths = gitText(['ls-tree','-r','--name-only',TARGET_COMMIT,'catalogue-requests'])
    .split(/\r?\n/).filter(path => path.endsWith('.json')).sort();
  const targetRequests = [];
  for (const path of paths) {
    try { targetRequests.push(JSON.parse(gitText(['show', `${TARGET_COMMIT}:${path}`]))); }
    catch (_) {}
  }
  return { targetHtml, targetRequests };
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

function assertRestored(state, sources) {
  assert.equal(state.entries?.[POST_TARGET_KEY], undefined);
  assert.equal(state.cards?.[POST_TARGET_KEY], undefined);
  assert.equal(state.sections?.brandLogos, undefined);
  assert.equal(state.sections?.hiddenBrands, undefined);
  const requests = requestMap(sources.targetRequests);
  for (const key of TARGET_ADDITION_KEYS) {
    const expected = requests.get(key);
    assert.ok(expected, `Missing target source ${key}`);
    assert.ok(state.entries?.[key], `Missing restored entry ${key}`);
    assert.equal(state.cards?.[key]?.catalogueType, 'main', `${key} must be main`);
    if (Array.isArray(expected.productionLines)) assert.deepEqual(state.entries[key].productionLines, expected.productionLines);
    if (Array.isArray(expected.practicalLines)) assert.deepEqual(state.entries[key].practicalLines, expected.practicalLines);
  }
  assert.equal(Object.keys(state.entries || {}).length, 49, 'Checkpoint must contain 49 dynamic entries.');
}

async function main() {
  const mode = process.argv[2] || '--dry-run-live';
  if (!['--dry-run-live','--apply'].includes(mode)) throw new Error('Use --dry-run-live or --apply.');
  const current = await fetchJson(`${BASE_URL}/api/catalogue-overrides?checkpoint_restore=${Date.now()}`);
  const sources = loadTargetSources();
  const restored = buildCheckpointState({ current, ...sources });
  assertRestored(restored, sources);

  console.log('CHECKPOINT_TARGET', TARGET_COMMIT);
  console.log('CURRENT_COUNTS', JSON.stringify({ entries:Object.keys(current.entries || {}).length, cards:Object.keys(current.cards || {}).length, sections:Object.keys(current.sections || {}).length }));
  console.log('RESTORED_COUNTS', JSON.stringify({ entries:Object.keys(restored.entries || {}).length, cards:Object.keys(restored.cards || {}).length, sections:Object.keys(restored.sections || {}).length }));
  console.log('RESTORE_DRY_RUN_OK');
  if (mode !== '--apply') return;

  const token = String(process.env.CATALOGUE_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required.');
  await fetchJson(`${BASE_URL}/api/catalogue-overrides`, {
    method:'PUT',
    headers:authHeaders(token, { 'content-type':'application/json' }),
    body:JSON.stringify({ version:3, cards:restored.cards, sections:restored.sections, entries:restored.entries })
  });

  const verified = await fetchJson(`${BASE_URL}/api/catalogue-overrides?checkpoint_verify=${Date.now()}`);
  assertRestored(verified, sources);
  assert.deepEqual(Object.keys(verified.entries).sort(), Object.keys(restored.entries).sort());

  const htmlResponse = await fetch(`${BASE_URL}/?checkpoint_verify=${Date.now()}`, { cache:'no-store' });
  const html = await htmlResponse.text();
  if (!htmlResponse.ok) throw new Error(`Production verification failed with HTTP ${htmlResponse.status}.`);
  if (html.includes('drew-estate-acid-krush-red-cameroon')) throw new Error('Post-target ACID entry still renders.');
  for (const key of TARGET_ADDITION_KEYS) if (!html.includes(`data-key="${key}"`)) throw new Error(`Production is missing ${key}.`);

  // Remove the orphaned post-target product image only after state/read-back verification succeeds.
  await fetch(`${BASE_URL}/api/catalogue-image/${POST_TARGET_KEY}`, { method:'DELETE', headers:authHeaders(token) }).catch(() => null);
  console.log('RESTORE_APPLY_VERIFIED');
}

if (process.argv[1]?.endsWith('restore-checkpoint-2026-09-16-1028.mjs')) {
  main().catch(error => { console.error(`Checkpoint restore failed: ${error.stack || error.message}`); process.exitCode = 1; });
}
