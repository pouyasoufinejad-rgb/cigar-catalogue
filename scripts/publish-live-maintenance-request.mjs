#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const DEFAULT_BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
const ALLOWED_CARD_FIELDS = new Set(['rank', 'practicalHtml', 'productionHtml', 'summaryHtml', 'title', 'eyebrow']);
const ALLOWED_ENTRY_FIELDS = new Set(['rank', 'summaryHtml', 'title', 'eyebrow']);
const PROTECTED_FIELDS = new Set(['strength', 'quality', 'size', 'laurel', 'flavour', 'price', 'packagePrice', 'retailerLinks']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(key) ? key : '';
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_all, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_all, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\u00a0/g, ' ');
}

function visibleText(fragment) {
  return decodeEntities(String(fragment || '')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''));
}

function lineMarkup(lines) {
  return lines.map(line => `<span class="artmeta-line">${escapeText(line)}</span>`).join('');
}

function classAttribute(tag) {
  return tag.match(/\bclass\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
}

export function extractArtmetaLines(html) {
  const source = String(html || '');
  const tags = /<\/?span\b[^>]*>/gi;
  const lines = [];
  let activeStart = -1;
  let activeDepth = 0;
  let match;

  while ((match = tags.exec(source))) {
    const tag = match[0];
    const closing = /^<\s*\//.test(tag);
    if (!closing) {
      if (activeStart >= 0) {
        activeDepth += 1;
      } else if (/(?:^|\s)artmeta-line(?:\s|$)/i.test(classAttribute(tag))) {
        activeStart = match.index + tag.length;
        activeDepth = 1;
      }
      continue;
    }

    if (activeStart < 0) continue;
    activeDepth -= 1;
    if (activeDepth === 0) {
      const text = visibleText(source.slice(activeStart, match.index)).trim();
      if (text) lines.push(text);
      activeStart = -1;
    }
  }
  return lines;
}

export function cleanPracticalHtml(html) {
  const source = String(html || '');
  if (!source.trim()) return source;
  const lines = extractArtmetaLines(source);
  if (!lines.length) throw new Error('Could not preserve Practical line structure while stripping inline styling.');
  return lineMarkup(lines);
}

export function normaliseCadencePracticalHtml(html) {
  const lines = extractArtmetaLines(html).map(line => line.replace(/^\s+/, ''));
  if (!lines.length) throw new Error('Could not read Practical lines for cadence repair.');
  const merged = [];
  for (const line of lines) {
    if (/Cadenc$/i.test(merged.at(-1) || '') && /^e$/i.test(line)) {
      merged[merged.length - 1] += line;
    } else {
      merged.push(line);
    }
  }
  return lineMarkup(merged);
}

export function normaliseProductionHtml(html) {
  const source = String(html || '');
  const lines = decodeEntities(source
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<\/span\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error('Could not read Production lines for cleanup.');
  return lineMarkup(lines);
}

export function stripEyebrowRankPrefix(value) {
  return String(value ?? '').replace(/^\s*No\.\s*\d+\s*[—–-]\s*/i, '');
}

function htmlAttribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '';
}

export function parseLiveRankingCards(html) {
  const cards = {};
  for (const match of String(html || '').matchAll(/<article\b[^>]*>/gi)) {
    const tag = match[0];
    const className = htmlAttribute(tag, 'class');
    if (!/(?:^|\s)card(?:\s|$)/i.test(className)) continue;
    const key = safeKey(htmlAttribute(tag, 'data-key'));
    if (!key) continue;
    const explicitType = String(htmlAttribute(tag, 'data-catalogue-type') || '').trim().toLowerCase();
    const taster = htmlAttribute(tag, 'data-taster') === '1' || explicitType === 'taster';
    const archived = htmlAttribute(tag, 'data-archived') === '1';
    const rank = Number(htmlAttribute(tag, 'data-rank'));
    const archivedRank = Number(htmlAttribute(tag, 'data-archived-rank'));
    cards[key] = {
      taster,
      archived,
      catalogueType: explicitType || (taster ? 'taster' : 'main'),
      ...(Number.isFinite(rank) && rank >= 1 ? { rank: Math.round(rank) } : {}),
      ...(Number.isFinite(archivedRank) && archivedRank >= 1 ? { archivedRank: Math.round(archivedRank) } : {})
    };
  }
  return cards;
}

function parseLiveExperienceTags(html) {
  const output = {};
  const cardRx = /<article\b[^>]*\bdata-key=["']([^"']+)["'][^>]*>[\s\S]*?<\/article>/gi;
  let cardMatch;
  while ((cardMatch = cardRx.exec(String(html || '')))) {
    const key = safeKey(cardMatch[1]);
    if (!key) continue;
    const tags = [...cardMatch[0].matchAll(/<span\b[^>]*\bclass=["'][^"']*\btag-chip\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
      .map(match => visibleText(match[1]).trim())
      .filter(Boolean);
    if (tags.length) output[key] = tags;
  }
  return output;
}

function validateRequest(input) {
  if (!isRecord(input) || input.operation !== 'bulk-maintenance') throw new Error('Maintenance request must use operation "bulk-maintenance".');
  const order = Array.isArray(input.tasterOrder) ? input.tasterOrder.map(safeKey).filter(Boolean) : [];
  if (!order.length || new Set(order).size !== order.length) throw new Error('bulk-maintenance requires a unique tasterOrder.');
  return {
    ...clone(input),
    tasterOrder: order,
    cadenceFixKeys: Array.isArray(input.cadenceFixKeys) ? input.cadenceFixKeys.map(safeKey).filter(Boolean) : [],
    productionNormaliseKeys: Array.isArray(input.productionNormaliseKeys) ? input.productionNormaliseKeys.map(safeKey).filter(Boolean) : [],
    practicalLineSets: isRecord(input.practicalLineSets) ? clone(input.practicalLineSets) : {},
    stringReplacements: isRecord(input.stringReplacements) ? clone(input.stringReplacements) : {}
  };
}

function sourceForField(state, key, field) {
  const card = isRecord(state.cards?.[key]) ? state.cards[key] : null;
  const entry = isRecord(state.entries?.[key]) ? state.entries[key] : null;
  if (card && own(card, field)) return { target: 'card', object: card };
  if (entry && own(entry, field)) return { target: 'entry', object: entry };
  return null;
}

function setEffectiveField(state, key, field, nextValue, { createCard = false } = {}) {
  const source = sourceForField(state, key, field);
  if (source) {
    source.object[field] = nextValue;
    return source.target;
  }
  if (!createCard) return '';
  state.cards[key] = { ...(isRecord(state.cards?.[key]) ? state.cards[key] : {}), [field]: nextValue };
  return 'card';
}

function effectiveField(state, key, field) {
  return sourceForField(state, key, field)?.object?.[field];
}

function applyReplacement(value, replacements) {
  let output = String(value ?? '');
  for (const pair of Array.isArray(replacements) ? replacements : []) {
    const from = String(pair?.from ?? '');
    const to = String(pair?.to ?? '');
    if (from) output = output.split(from).join(to);
  }
  return output;
}

function catalogueType(card = {}) {
  const explicit = String(card.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || card.taster === true) return 'taster';
  return 'main';
}

function activeRank(card) {
  const rank = Number(card?.rank);
  return Number.isFinite(rank) && rank >= 1 ? Math.round(rank) : null;
}

function assertActiveCohortsContiguous(liveCards, nextCards, tasterOrder) {
  const merged = {};
  for (const [key, live] of Object.entries(liveCards)) merged[key] = { ...live, ...(isRecord(nextCards[key]) ? nextCards[key] : {}) };
  for (const [key, override] of Object.entries(nextCards)) if (!merged[key]) merged[key] = { ...override };

  for (const type of ['main', 'half']) {
    const ranks = Object.values(merged)
      .filter(card => !card.archived && catalogueType(card) === type)
      .map(activeRank)
      .filter(rank => rank !== null)
      .sort((a, b) => a - b);
    ranks.forEach((rank, index) => {
      if (rank !== index + 1) throw new Error(`Live ${type} cohort is not contiguous at rank ${index + 1}; refusing unrelated rank changes.`);
    });
  }

  const actualTasters = Object.entries(merged)
    .filter(([, card]) => !card.archived && catalogueType(card) === 'taster')
    .map(([key]) => key)
    .sort();
  const requestedTasters = [...tasterOrder].sort();
  assert.deepEqual(actualTasters, requestedTasters, 'Active taster set changed; refusing to apply an outdated explicit order.');
}

function reportSnapshot(state, liveHtml) {
  const field = (key, name) => effectiveField(state, key, name);
  const lfdProduction = field('la-flor-dominicana-double-ligero-chiselito-maduro', 'productionHtml')
    ?? state.entries?.['la-flor-dominicana-double-ligero-chiselito-maduro']?.productionLines
    ?? null;
  return {
    montecristoShort: {
      flavour: field('montecristo-short', 'flavour'),
      noteHtml: field('montecristo-short', 'noteHtml')
    },
    blackenedM81: {
      flavour: field('blackened-m81-coronets', 'flavour'),
      summaryHtml: field('blackened-m81-coronets', 'summaryHtml')
    },
    ligaPrivadaNo9: {
      flavour: field('liga-privada-no-9-coronets', 'flavour') ?? field('liga-privada-no-9-short-panatela', 'flavour')
    },
    experienceTagsByKey: parseLiveExperienceTags(liveHtml),
    olivaSerieGMaduroSpecialG: {
      rank: field('oliva-serie-g-maduro-special-g', 'rank'),
      archived: Boolean(field('oliva-serie-g-maduro-special-g', 'archived')),
      stockPin: field('oliva-serie-g-maduro-special-g', 'stockPin'),
      noteHtml: field('oliva-serie-g-maduro-special-g', 'noteHtml')
    },
    lfdChiselitoProduction: lfdProduction,
    foundationCadenceOutstanding: true
  };
}

function changedFieldMap(before, after, allowedFields) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    const left = isRecord(before?.[key]) ? before[key] : {};
    const right = isRecord(after?.[key]) ? after[key] : {};
    const fields = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const field of fields) {
      try { assert.deepEqual(left[field], right[field]); }
      catch {
        if (!allowedFields.has(field)) throw new Error(`Maintenance attempted to change forbidden field "${field}" on "${key}".`);
        (changes[key] ||= []).push(field);
      }
    }
  }
  return changes;
}

export function buildMaintenanceMutation(inputState, liveHtml, inputRequest) {
  const request = validateRequest(inputRequest);
  const original = clone(isRecord(inputState) ? inputState : {});
  const state = {
    ...clone(original),
    version: 3,
    cards: isRecord(original.cards) ? clone(original.cards) : {},
    entries: isRecord(original.entries) ? clone(original.entries) : {},
    sections: isRecord(original.sections) ? clone(original.sections) : {}
  };
  const liveCards = parseLiveRankingCards(liveHtml);

  assertActiveCohortsContiguous(liveCards, state.cards, request.tasterOrder);

  for (const [key, card] of Object.entries(state.cards)) {
    const live = liveCards[key] || {};
    if ((card.archived === true || live.archived === true) && own(card, 'rank')) delete card.rank;
  }

  request.tasterOrder.forEach((key, index) => {
    state.cards[key] = { ...(isRecord(state.cards[key]) ? state.cards[key] : {}), rank: index + 1 };
    if (isRecord(state.entries[key])) state.entries[key].rank = index + 1;
  });

  if (request.scanPracticalInlineStyles) {
    for (const [key, card] of Object.entries(state.cards)) {
      if (typeof card.practicalHtml !== 'string' || !/\bstyle\s*=/i.test(card.practicalHtml)) continue;
      card.practicalHtml = cleanPracticalHtml(card.practicalHtml);
    }
  }

  for (const key of request.cadenceFixKeys) {
    const current = effectiveField(state, key, 'practicalHtml');
    if (typeof current === 'string' && current.trim()) setEffectiveField(state, key, 'practicalHtml', normaliseCadencePracticalHtml(current), { createCard: true });
  }

  for (const [rawKey, rawLines] of Object.entries(request.practicalLineSets)) {
    const key = safeKey(rawKey);
    if (!key || !Array.isArray(rawLines)) continue;
    const lines = rawLines.map(value => String(value ?? '').trim()).filter(Boolean);
    setEffectiveField(state, key, 'practicalHtml', lineMarkup(lines), { createCard: true });
  }

  for (const key of request.productionNormaliseKeys) {
    let current = effectiveField(state, key, 'productionHtml');
    if (typeof current !== 'string' || !current.trim()) {
      const lines = state.entries?.[key]?.productionLines;
      if (Array.isArray(lines) && lines.length) current = lineMarkup(lines.map(String));
    }
    if (typeof current === 'string' && current.trim()) setEffectiveField(state, key, 'productionHtml', normaliseProductionHtml(current), { createCard: true });
  }

  for (const [rawKey, fields] of Object.entries(request.stringReplacements)) {
    const key = safeKey(rawKey);
    if (!key || !isRecord(fields)) continue;
    for (const [field, replacements] of Object.entries(fields)) {
      if (!['summaryHtml', 'title'].includes(field)) throw new Error(`Unsupported string replacement field: ${field}`);
      const current = effectiveField(state, key, field);
      if (typeof current !== 'string') continue;
      setEffectiveField(state, key, field, applyReplacement(current, replacements));
    }
  }

  if (request.scanEyebrowRankPrefixes) {
    const keys = new Set([...Object.keys(state.cards), ...Object.keys(state.entries)]);
    for (const key of keys) {
      const source = sourceForField(state, key, 'eyebrow');
      if (!source || typeof source.object.eyebrow !== 'string') continue;
      const cleaned = stripEyebrowRankPrefix(source.object.eyebrow);
      if (cleaned !== source.object.eyebrow) source.object.eyebrow = cleaned;
    }
  }

  const cardChanges = changedFieldMap(original.cards || {}, state.cards, ALLOWED_CARD_FIELDS);
  const entryChanges = changedFieldMap(original.entries || {}, state.entries, ALLOWED_ENTRY_FIELDS);

  return {
    state,
    report: reportSnapshot(original, liveHtml),
    changedFields: { cards: cardChanges, entries: entryChanges }
  };
}

function headers(token, extra = {}) {
  return { ...extra, authorization: `Bearer ${token}` };
}

async function responseError(response, label, token = '') {
  let body = String(await response.text().catch(() => '')).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 400);
  if (token) body = body.split(token).join('[REDACTED]');
  return new Error(`${label} failed with HTTP ${response.status}${body ? `: ${body}` : ''}`);
}

async function fetchJson(fetchImpl, url, options, label, token = '') {
  const response = await fetchImpl(url, options);
  if (!response.ok) throw await responseError(response, label, token);
  return response.json();
}

function assertUnchangedOutsideAllowed(beforeMap, afterMap, allowedFields, label) {
  for (const [key, before] of Object.entries(beforeMap || {})) {
    const after = afterMap?.[key];
    if (!isRecord(after)) throw new Error(`${label} read-back is missing "${key}".`);
    for (const [field, value] of Object.entries(before)) {
      if (allowedFields.has(field)) continue;
      try { assert.deepEqual(after[field], value); }
      catch { throw new Error(`${label} changed forbidden field "${field}" on "${key}".`); }
    }
    for (const protectedField of PROTECTED_FIELDS) {
      if (!own(before, protectedField)) continue;
      try { assert.deepEqual(after[protectedField], before[protectedField]); }
      catch { throw new Error(`${label} changed protected field "${protectedField}" on "${key}".`); }
    }
  }
}

function assertMaintenanceReadBack(original, expected, verified, request, liveHtml) {
  assertUnchangedOutsideAllowed(original.cards || {}, verified.cards || {}, ALLOWED_CARD_FIELDS, 'Card');
  assertUnchangedOutsideAllowed(original.entries || {}, verified.entries || {}, ALLOWED_ENTRY_FIELDS, 'Entry');

  for (const key of request.tasterOrder) {
    const expectedRank = expected.cards[key]?.rank;
    if (Number(verified.cards?.[key]?.rank) !== Number(expectedRank)) throw new Error(`Taster rank read-back failed for "${key}".`);
  }
  for (const [key, card] of Object.entries(verified.cards || {})) {
    const live = parseLiveRankingCards(liveHtml)[key] || {};
    if ((card.archived === true || live.archived === true) && own(card, 'rank')) throw new Error(`Archived card "${key}" still has an active rank.`);
  }

  for (const [key, fields] of Object.entries(expected.cards || {})) {
    const changed = Object.keys(fields).filter(field => ALLOWED_CARD_FIELDS.has(field));
    if (!changed.length || !isRecord(verified.cards?.[key])) continue;
    for (const field of changed) {
      if (!own(expected.cards[key], field) || !own(verified.cards[key], field)) continue;
      try { assert.deepEqual(verified.cards[key][field], expected.cards[key][field]); }
      catch { throw new Error(`Card read-back failed for "${key}" field "${field}".`); }
    }
  }
}

export async function publishMaintenanceRequestDocument(input, options = {}) {
  const request = validateRequest(input);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for publication.');

  const original = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides`, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' }, 'Catalogue state read');
  const htmlResponse = await fetchImpl(`${baseUrl}/?catalogue_source=maintenance`, { method: 'GET', headers: { accept: 'text/html' }, cache: 'no-store' });
  if (!htmlResponse.ok) throw await responseError(htmlResponse, 'Live catalogue HTML read');
  const liveHtml = await htmlResponse.text();

  const mutation = buildMaintenanceMutation(original, liveHtml, request);
  const changedEntryKeys = Object.keys(mutation.changedFields.entries || {});

  for (const key of changedEntryKeys) {
    const response = await fetchImpl(`${baseUrl}/api/catalogue-entry/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: headers(token, { 'content-type': 'application/json' }),
      body: JSON.stringify(mutation.state.entries[key])
    });
    if (!response.ok) throw await responseError(response, `Entry write for ${key}`, token);
  }

  const stateResponse = await fetchImpl(`${baseUrl}/api/catalogue-overrides`, {
    method: 'PUT',
    headers: headers(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ version: 3, cards: mutation.state.cards, sections: mutation.state.sections })
  });
  if (!stateResponse.ok) throw await responseError(stateResponse, 'Catalogue state write', token);

  const verified = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=1`, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' }, 'Catalogue state read-back');
  assertMaintenanceReadBack(original, mutation.state, verified, request, liveHtml);

  const productionResponse = await fetchImpl(`${baseUrl}/?catalogue_verify=maintenance`, { method: 'GET', headers: { accept: 'text/html' }, cache: 'no-store' });
  if (!productionResponse.ok) throw await responseError(productionResponse, 'Production rendering verification');
  const productionHtml = await productionResponse.text();
  const mustRender = new Set([
    ...request.tasterOrder,
    ...Object.keys(request.practicalLineSets || {}),
    ...request.productionNormaliseKeys,
    ...Object.keys(request.stringReplacements || {})
  ]);
  for (const key of mustRender) {
    if (!new RegExp(`\\bdata-key=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(productionHtml)) {
      throw new Error(`Production rendering is missing catalogue key "${key}".`);
    }
  }

  return {
    ok: true,
    operation: 'bulk-maintenance',
    verified: true,
    changedFields: mutation.changedFields,
    report: mutation.report,
    verification: {
      tasterRanks: Object.fromEntries(request.tasterOrder.map(key => [key, verified.cards?.[key]?.rank])),
      archivedCardsWithActiveRank: Object.entries(verified.cards || {}).filter(([, card]) => card?.archived && own(card, 'rank')).map(([key]) => key)
    }
  };
}

export async function publishMaintenanceRequestFile(requestPath, options = {}) {
  const body = await readFile(resolve(options.repoRoot || process.cwd(), requestPath), 'utf8');
  const parsed = JSON.parse(body);
  return publishMaintenanceRequestDocument(parsed, options);
}

async function main(argv) {
  const requestPath = argv[2];
  if (!requestPath) throw new Error('Usage: node scripts/publish-live-maintenance-request.mjs <catalogue-requests/request.json>');
  const result = await publishMaintenanceRequestFile(requestPath);
  console.log('Published bulk-maintenance from live catalogue state; KV read-back and production rendering verified.');
  console.log(`MAINTENANCE_RESULT ${JSON.stringify(result)}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main(process.argv).catch(error => {
    console.error(`Catalogue maintenance failed: ${error.message}`);
    process.exitCode = 1;
  });
}
