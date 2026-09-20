#!/usr/bin/env node
import { readFile, realpath, stat } from 'node:fs/promises';
import {
  defaultBlendVariantId,
  defaultVariantId,
  normaliseBlendVariants,
  normaliseVariants
} from '../public/catalogue-variants.mjs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  normalisePublisherRankingState,
  reorderPublisherTarget,
  assertPublisherRankingInvariant
} from './recommendation-subsection-ranking.mjs';

export const DEFAULT_BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const SUPPORTED_OPERATIONS = new Set(['upsert-entry', 'archive-entry', 'unarchive-entry', 'delete-entry', 'replace-image', 'update-sections']);
const PRODUCTION_VERIFY_RETRY_DELAYS = [2000, 5000, 10000];

const CARD_EDITORIAL_FIELDS = new Set([
  'archived', 'archivedAt', 'archivedRank', 'archivedSubsection', 'subsection', 'stockPin', 'rank', 'strength', 'quality', 'flavour', 'size', 'laurel',
  'experienceTags', 'eyebrow', 'summaryHtml', 'noteHtml', 'productionHtml', 'practicalHtml'
]);
const CARD_STRUCTURAL_FIELDS = new Set([
  'brand', 'title', 'packagePrice', 'packageLabel', 'price', 'country', 'length', 'ring', 'risk', 'taster', 'catalogueType',
  'retailerLinks', 'imageUrl', 'smokeTime',
  // The sizes an entry covers and which one it shows first. These filter lists drop
  // anything they do not name, so leaving them out would discard every variant on the way
  // to KV without any error to show for it.
  'sizeVariants', 'defaultVariantId', 'blendVariants', 'defaultBlendVariantId'
]);
const DYNAMIC_ONLY_FIELDS = new Set([
  'stock', 'imageSourceKey', 'imageVersion', 'priceChecked', 'stockChecked', 'productionLines', 'practicalLines'
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(key) ? key : '';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(now) {
  const value = typeof now === 'function' ? now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid publication timestamp.');
  return date.toISOString();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitiseErrorBody(text) {
  return String(text || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 400);
}

function buildHeaders(token, headers = {}) {
  const output = new Headers(headers);
  output.set('authorization', `Bearer ${token}`);
  return output;
}

async function responseError(response, label, secret = '') {
  let body = sanitiseErrorBody(await response.text().catch(() => ''));
  if (secret) body = body.split(String(secret)).join('[REDACTED]');
  return new Error(`${label} failed with HTTP ${response.status}${body ? `: ${body}` : ''}`);
}

async function fetchJson(fetchImpl, url, options = {}, label = 'Request', secret = '') {
  const response = await fetchImpl(url, options);
  if (!response.ok) throw await responseError(response, label, secret);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

async function fetchProductionHtml(fetchImpl, url, sleep) {
  for (let attempt = 0; attempt <= PRODUCTION_VERIFY_RETRY_DELAYS.length; attempt += 1) {
    const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'text/html' }, cache: 'no-store' });
    if (response.ok) return response.text();

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === PRODUCTION_VERIFY_RETRY_DELAYS.length) {
      throw await responseError(response, 'Production HTML verification');
    }

    await response.arrayBuffer().catch(() => {});
    await sleep(PRODUCTION_VERIFY_RETRY_DELAYS[attempt]);
  }
  throw new Error('Production HTML verification exhausted its retry budget.');
}

function stripDerivedCardValue(card) {
  const output = { ...(isRecord(card) ? card : {}) };
  delete output.value;
  return output;
}

function normaliseStateShape(value) {
  const input = isRecord(value) ? value : {};
  const cards = {};
  for (const [key, card] of Object.entries(isRecord(input.cards) ? input.cards : {})) cards[key] = stripDerivedCardValue(card);
  return {
    version: 3,
    cards,
    sections: isRecord(input.sections) ? clone(input.sections) : {},
    entries: isRecord(input.entries) ? clone(input.entries) : {}
  };
}

function htmlAttribute(tag, name) {
  const pattern = new RegExp(`\\b${escapeRegex(name)}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return tag.match(pattern)?.[2] ?? '';
}

function catalogueType(card) {
  const explicit = String(card?.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || Boolean(card?.taster)) return 'taster';
  return 'main';
}

function applyCatalogueType(card, typeInput) {
  const type = catalogueType({ catalogueType: typeInput, taster: typeInput === 'taster' });
  return { ...card, catalogueType: type, taster: type === 'taster' };
}

function parseStaticRankingCards(html) {
  const cards = {};
  for (const match of String(html || '').matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)) {
    const tag = `<article${match[1]}>`;
    const body = match[2] || '';
    const className = htmlAttribute(tag, 'class');
    if (!/(?:^|\s)card(?:\s|$)/i.test(className)) continue;
    const key = safeKey(htmlAttribute(tag, 'data-key'));
    if (!key) continue;
    const taster = htmlAttribute(tag, 'data-taster') === '1';
    const explicitType = htmlAttribute(tag, 'data-catalogue-type');
    const card = {
      taster,
      catalogueType: explicitType || (taster ? 'taster' : 'main'),
      archived: htmlAttribute(tag, 'data-archived') === '1'
    };
    const rank = Number(htmlAttribute(tag, 'data-rank'));
    if (Number.isFinite(rank) && rank >= 1) card.rank = Math.round(rank);
    const archivedRank = Number(htmlAttribute(tag, 'data-archived-rank'));
    if (Number.isFinite(archivedRank) && archivedRank >= 1) card.archivedRank = Math.round(archivedRank);
    const visualRing = Number(body.match(/\bdata-visual-ring=["'](\d{2})["']/i)?.[1]);
    if (Number.isFinite(visualRing)) card.visualRing = visualRing;
    const scrubbed = body.replace(/<img\b[^>]*>/gi, ' ');
    const sizeText = scrubbed.match(/\d+(?:\.\d+)?(?:″|&quot;|")?\s*[×x]\s*\d{2}(?!\d)/i)?.[0];
    if (sizeText) card.sizeText = sizeText;
    const productionStart = scrubbed.search(/<[^>]*class=["'][^"']*artmeta-left[^"']*["'][^>]*>/i);
    const productionTail = productionStart >= 0 ? scrubbed.slice(productionStart) : '';
    const practicalStart = productionTail.search(/<[^>]*class=["'][^"']*artmeta-right[^"']*["'][^>]*>/i);
    const production = practicalStart >= 0 ? productionTail.slice(0, practicalStart) : productionTail;
    card.productionLines = Array.from(production.matchAll(/<[^>]*class=["'][^"']*artmeta-line[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi), line =>
      line[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim()
    ).filter(Boolean);
    cards[key] = card;
  }
  return cards;
}

function rankingCardFromEntry(entry) {
  const taster = Boolean(entry?.taster);
  const card = {
    taster,
    catalogueType: String(entry?.catalogueType || '').trim() || (taster ? 'taster' : 'main'),
    archived: Boolean(entry?.archived)
  };
  const rank = Number(entry?.rank);
  if (Number.isFinite(rank) && rank >= 1) card.rank = Math.round(rank);
  const archivedRank = Number(entry?.archivedRank);
  if (Number.isFinite(archivedRank) && archivedRank >= 1) card.archivedRank = Math.round(archivedRank);
  const ring = Number(entry?.ring);
  if (Number.isFinite(ring) && ring >= 10 && ring <= 99) card.ring = Math.round(ring);
  if (Array.isArray(entry?.productionLines)) card.productionLines = entry.productionLines.map(value => String(value));
  if (typeof entry?.archivedAt === 'string') card.archivedAt = entry.archivedAt;
  return card;
}

async function completeRankingCards(repoRoot, state, includeStaticCatalogue) {
  const cards = {};

  if (includeStaticCatalogue) {
    let html = '';
    try {
      html = await readFile(resolve(repoRoot, 'public/index.html'), 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    Object.assign(cards, parseStaticRankingCards(html));
  }

  for (const [key, entry] of Object.entries(state.entries || {})) {
    cards[key] = { ...(cards[key] || {}), ...rankingCardFromEntry(entry) };
  }
  for (const [key, override] of Object.entries(state.cards || {})) {
    cards[key] = { ...(cards[key] || {}), ...stripDerivedCardValue(override) };
  }
  return cards;
}

function linesToMarkup(lines) {
  if (!Array.isArray(lines)) return undefined;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  return lines.map(line => `<span class="artmeta-line">${escape(line)}</span>`).join('');
}

function markupToLines(html) {
  if (typeof html !== 'string') return undefined;
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/[^>]+>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);
}

function patchForCard(entryPatch) {
  const patch = {};
  for (const [key, value] of Object.entries(isRecord(entryPatch) ? entryPatch : {})) {
    if (key === 'value' || value === undefined) continue;
    if (CARD_EDITORIAL_FIELDS.has(key) || CARD_STRUCTURAL_FIELDS.has(key)) patch[key] = clone(value);
  }
  if (Array.isArray(entryPatch?.productionLines) && entryPatch.productionHtml === undefined) patch.productionHtml = linesToMarkup(entryPatch.productionLines);
  if (Array.isArray(entryPatch?.practicalLines) && entryPatch.practicalHtml === undefined) patch.practicalHtml = linesToMarkup(entryPatch.practicalLines);
  return patch;
}

function patchForDynamic(entryPatch) {
  const patch = {};
  for (const [key, value] of Object.entries(isRecord(entryPatch) ? entryPatch : {})) {
    if (key === 'value' || value === undefined) continue;
    if (CARD_EDITORIAL_FIELDS.has(key) || CARD_STRUCTURAL_FIELDS.has(key) || DYNAMIC_ONLY_FIELDS.has(key)) patch[key] = clone(value);
  }
  delete patch.catalogueType;
  delete patch.subsection;
  delete patch.archivedSubsection;
  delete patch.flavour;
  delete patch.laurel;
  delete patch.archivedRank;
  delete patch.productionHtml;
  delete patch.practicalHtml;
  if (typeof entryPatch?.productionHtml === 'string' && entryPatch.productionLines === undefined) patch.productionLines = markupToLines(entryPatch.productionHtml);
  if (typeof entryPatch?.practicalHtml === 'string' && entryPatch.practicalLines === undefined) patch.practicalLines = markupToLines(entryPatch.practicalHtml);
  return patch;
}

function mergeCard(existing, patch) {
  return { ...stripDerivedCardValue(existing), ...patchForCard(patch) };
}

function rankNumber(card) {
  const value = Number(card?.rank);
  return Number.isFinite(value) && value >= 1 ? Math.round(value) : Number.MAX_SAFE_INTEGER;
}

function normaliseRankings(cardsInput, sections = {}) {
  const scratch = { version:3, cards:cardsInput || {}, sections, entries:{} };
  normalisePublisherRankingState(scratch, cardsInput || {});
  return scratch.cards;
}

function assertRankingInvariant(cardsInput, label, sections = {}) {
  return assertPublisherRankingInvariant({ version:3, cards:cardsInput || {}, sections, entries:{} }, label);
}

function reorderForTarget(cardsInput, key, targetCard, nowString, sections = {}) {
  const scratch = { version:3, cards:{ ...(cardsInput || {}) }, sections, entries:{} };
  reorderPublisherTarget(scratch, key, targetCard, nowString);
  return scratch.cards;
}

export const MAX_VARIANT_PACKAGE_COUNT = 10;

function validateVariantPurchaseCaps(entry) {
  const inspect = (variants, label) => {
    if (!Array.isArray(variants)) return;
    for (const variant of variants) {
      if (!isRecord(variant)) continue;
      const count = Number(variant.packageCount);
      if (Number.isFinite(count) && count > MAX_VARIANT_PACKAGE_COUNT) {
        const id = String(variant.id || variant.label || 'unnamed').trim();
        throw new Error(`${label} variant "${id}" packageCount cannot exceed ${MAX_VARIANT_PACKAGE_COUNT}.`);
      }
      inspect(variant.sizeVariants, 'Size');
      inspect(variant.blendVariants, 'Blend');
    }
  };
  inspect(entry?.sizeVariants, 'Size');
  inspect(entry?.blendVariants, 'Blend');
}

function validateImage(image, required) {
  if (!image) {
    if (required) throw new Error('replace-image requires an image object.');
    return null;
  }
  if (!isRecord(image)) throw new Error('image must be an object.');
  const path = String(image.path || '').trim();
  const mimeType = String(image.mimeType || '').trim().toLowerCase();
  if (!path) throw new Error('image.path is required.');
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error('Image must be PNG, JPEG or WebP.');
  return { path, mimeType };
}

export function validateRequest(input) {
  if (!isRecord(input)) throw new Error('Publication request must be a JSON object.');
  const operation = String(input.operation || '').trim();
  if (!SUPPORTED_OPERATIONS.has(operation)) throw new Error(`Unsupported operation: ${operation || '(missing)'}.`);
  const key = operation === 'update-sections' ? '' : safeKey(input.key);
  if (operation !== 'update-sections' && !key) throw new Error('Invalid catalogue key.');
  const entry = isRecord(input.entry) ? clone(input.entry) : {};
  if (operation === 'upsert-entry' && !isRecord(input.entry)) throw new Error('upsert-entry requires an entry object.');
  if (operation === 'upsert-entry') validateVariantPurchaseCaps(entry);
  const sections = isRecord(input.sections) ? clone(input.sections) : {};
  if (operation === 'update-sections') {
    const sectionNames = Object.keys(sections);
    if (!sectionNames.length) throw new Error('update-sections requires a sections object.');
    const invalid = sectionNames.some(name => {
      if (name === 'legendHtml' || name === 'benchmarksHtml') return typeof sections[name] !== 'string';
      if (name !== 'recommendationSubsections') return true;
      return !Array.isArray(sections[name]) || !sections[name].length || sections[name].some(section =>
        !isRecord(section) || !/^[a-z0-9][a-z0-9_-]*$/i.test(String(section.id || '')) ||
        typeof section.title !== 'string' || typeof section.note !== 'string' ||
        !Array.isArray(section.entryKeys) || section.entryKeys.some(key => !safeKey(key))
      );
    });
    if (invalid) throw new Error('update-sections accepts legendHtml, benchmarksHtml and valid recommendationSubsections only.');
  }
  const image = validateImage(input.image, operation === 'replace-image');
  return {
    id: String(input.id || '').trim(),
    operation,
    key,
    entry,
    sections,
    image,
    note: String(input.note || '').trim()
  };
}

async function loadImage(image, repoRoot) {
  if (!image) return null;
  const root = await realpath(resolve(repoRoot));
  const absolute = resolve(root, image.path);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith('..') || resolve(root, rel) !== absolute) throw new Error('Image path must resolve inside the repository.');
  if (!rel.replace(/\\/g, '/').startsWith('catalogue-requests/')) throw new Error('Image assets must live under catalogue-requests/.');
  const actual = await realpath(absolute).catch(() => '');
  if (!actual || (actual !== root && relative(root, actual).startsWith('..'))) throw new Error('Image file is unavailable or resolves outside the repository.');
  const info = await stat(actual);
  if (!info.isFile()) throw new Error('Image path is not a file.');
  if (!info.size) throw new Error('Image is empty.');
  if (info.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 12 MiB upload limit.');
  const bytes = await readFile(actual);
  return { bytes, mimeType: image.mimeType, path: rel.replace(/\\/g, '/') };
}

async function uploadImage(fetchImpl, baseUrl, token, key, imageData) {
  const url = `${baseUrl}/api/catalogue-image/${encodeURIComponent(key)}`;
  const response = await fetchImpl(url, {
    method: 'PUT',
    headers: buildHeaders(token, { 'content-type': imageData.mimeType }),
    body: imageData.bytes
  });
  if (!response.ok) throw await responseError(response, 'Image upload', token);
  const payload = await response.json().catch(() => ({}));
  if (payload?.ok !== true) throw new Error('Image upload did not return an ok response.');
  const check = await fetchImpl(url, { method: 'GET', headers: { accept: imageData.mimeType }, cache: 'no-store' });
  if (!check.ok) throw await responseError(check, 'Image verification');
  const type = (check.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== imageData.mimeType) throw new Error(`Image verification returned ${type || 'unknown MIME'} instead of ${imageData.mimeType}.`);
  const downloaded = Buffer.from(await check.arrayBuffer());
  if (!downloaded.equals(imageData.bytes)) throw new Error('Image verification bytes do not match the uploaded image.');
}

async function putEntry(fetchImpl, baseUrl, token, key, entry) {
  const url = `${baseUrl}/api/catalogue-entry/${encodeURIComponent(key)}`;
  return fetchJson(fetchImpl, url, {
    method: 'PUT',
    headers: buildHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(entry)
  }, 'Entry write', token);
}

async function deleteEntry(fetchImpl, baseUrl, token, key) {
  const url = `${baseUrl}/api/catalogue-entry/${encodeURIComponent(key)}`;
  return fetchJson(fetchImpl, url, {
    method: 'DELETE',
    headers: buildHeaders(token)
  }, 'Entry delete', token);
}

async function putState(fetchImpl, baseUrl, token, state) {
  return fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides`, {
    method: 'PUT',
    headers: buildHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ version: 3, cards: state.cards, sections: state.sections })
  }, 'Catalogue state write', token);
}

function intendedKeys(request) {
  const keys = new Set(Object.keys(request.entry || {}));
  if (request.operation === 'archive-entry') {
    keys.add('archived'); keys.add('archivedAt'); keys.add('archivedRank');
  }
  if (request.operation === 'unarchive-entry') {
    keys.add('archived'); keys.add('archivedAt');
  }
  if (request.image) keys.add('imageUrl');
  return keys;
}

function assertSubset(actual, expected, keys, label) {
  for (const key of keys) {
    if (!(key in expected)) continue;
    try {
      // Size variants are stored normalised: ids are slugged, a per-stick price is derived
      // from the package, and an unpriced size is marked as such. Comparing the request's
      // raw shape against that would fail every publish that carries sizes, so both sides
      // are normalised and the comparison asks whether the same sizes came back.
      if (key === 'sizeVariants') {
        assert.deepEqual(
          normaliseVariants({ sizeVariants: actual?.[key] }),
          normaliseVariants({ sizeVariants: expected[key] })
        );
        continue;
      }
      if (key === 'defaultVariantId') {
        assert.equal(
          defaultVariantId({ sizeVariants: actual?.sizeVariants, defaultVariantId: actual?.[key] }),
          defaultVariantId({ sizeVariants: expected.sizeVariants, defaultVariantId: expected[key] })
        );
        continue;
      }
      if (key === 'blendVariants') {
        assert.deepEqual(
          normaliseBlendVariants({ blendVariants: actual?.[key] }),
          normaliseBlendVariants({ blendVariants: expected[key] })
        );
        continue;
      }
      if (key === 'defaultBlendVariantId') {
        assert.equal(
          defaultBlendVariantId({
            blendVariants: actual?.blendVariants,
            defaultBlendVariantId: actual?.[key]
          }),
          defaultBlendVariantId({
            blendVariants: expected.blendVariants,
            defaultBlendVariantId: expected[key]
          })
        );
        continue;
      }
      assert.deepEqual(actual?.[key], expected[key]);
    } catch {
      throw new Error(`${label} verification failed for field "${key}".`);
    }
  }
}

function ensureNewDynamicMinimum(entry) {
  if (!String(entry.brand || '').trim() || !String(entry.title || '').trim()) {
    throw new Error('A new dynamic entry requires brand and title.');
  }
}

export async function publishRequestDocument(input, options = {}) {
  const request = validateRequest(input);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for publication.');
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const timestamp = nowIso(options.now);
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));

  const rawState = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides`, { headers: { accept: 'application/json' }, cache: 'no-store' }, 'Catalogue state read');
  const state = normaliseStateShape(rawState);
  const includeStaticCatalogue = options.includeStaticCatalogue ?? (options.repoRoot !== undefined || options.fetchImpl === undefined);
  if (request.operation === 'update-sections') {
    state.sections = { ...state.sections, ...request.sections };
    if (Array.isArray(request.sections.recommendationSubsections)) {
      state.cards = normaliseRankings(await completeRankingCards(repoRoot, state, includeStaticCatalogue), state.sections);
      assertRankingInvariant(state.cards, 'Catalogue section write', state.sections);
    }
    await putState(fetchImpl, baseUrl, token, state);

    const verifiedStateRaw = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=1`, { headers: { accept: 'application/json' }, cache: 'no-store' }, 'Catalogue state read-back');
    const verifiedState = normaliseStateShape(verifiedStateRaw);
    assertSubset(verifiedState.sections, state.sections, new Set(Object.keys(request.sections)), 'Catalogue section read-back');

    const productionUrl = `${baseUrl}/?catalogue_verify=benchmarks`;
    if (typeof request.sections.benchmarksHtml === 'string') {
      const summaries = [...request.sections.benchmarksHtml.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gi)]
        .map(match => match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      for (let attempt = 0; attempt <= PRODUCTION_VERIFY_RETRY_DELAYS.length; attempt += 1) {
        const html = await fetchProductionHtml(fetchImpl, productionUrl, sleep);
        const missing = summaries.filter(summary => !html.includes(summary));
        if (!missing.length) break;
        if (attempt === PRODUCTION_VERIFY_RETRY_DELAYS.length) {
          throw new Error(`Production Benchmarks is missing "${missing[0]}".`);
        }
        await sleep(PRODUCTION_VERIFY_RETRY_DELAYS[attempt]);
      }
    } else {
      await fetchProductionHtml(fetchImpl, productionUrl, sleep);
    }

    return { ok: true, operation: request.operation, target: 'sections', verified: true };
  }
  state.cards = normaliseRankings(await completeRankingCards(repoRoot, state, includeStaticCatalogue), state.sections);
  const existingDynamic = isRecord(state.entries[request.key]) ? clone(state.entries[request.key]) : null;
  const existingCard = isRecord(state.cards[request.key]) ? clone(state.cards[request.key]) : null;
  const exists = Boolean(existingDynamic || existingCard);

  if (!exists && request.operation !== 'upsert-entry') throw new Error(`Catalogue key "${request.key}" does not exist.`);
  const target = existingDynamic || !existingCard ? 'dynamic' : 'static';

  if (request.operation === 'delete-entry') {
    if (!existingDynamic) throw new Error('delete-entry can only remove a dynamic catalogue entry.');
    await deleteEntry(fetchImpl, baseUrl, token, request.key);

    const verifiedStateRaw = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=1`, { headers: { accept: 'application/json' }, cache: 'no-store' }, 'Catalogue state read-back');
    const verifiedState = normaliseStateShape(verifiedStateRaw);
    if (isRecord(verifiedState.entries[request.key]) || isRecord(verifiedState.cards[request.key])) {
      throw new Error(`Catalogue deletion read-back still contains "${request.key}".`);
    }
    assertRankingInvariant(verifiedState.cards, 'Catalogue state read-back', verifiedState.sections);

    const html = await fetchProductionHtml(fetchImpl, `${baseUrl}/?catalogue_verify=${encodeURIComponent(request.key)}`, sleep);
    const keyPattern = new RegExp(`\\bdata-key=["']${escapeRegex(request.key)}["']`, 'i');
    if (keyPattern.test(html)) throw new Error(`Catalogue key "${request.key}" still appears in production HTML after deletion.`);

    return { ok: true, operation: request.operation, key: request.key, target: 'dynamic', verified: true };
  }

  let entryPatch = clone(request.entry);
  let cardPatch = clone(request.entry);

  if (request.operation === 'archive-entry') {
    const currentRank = existingCard?.rank ?? existingDynamic?.rank ?? 1;
    entryPatch = { archived: true, archivedAt: existingDynamic?.archivedAt || existingCard?.archivedAt || timestamp };
    cardPatch = {
      archived: true,
      archivedAt: existingCard?.archivedAt || existingDynamic?.archivedAt || timestamp,
      archivedRank: existingCard?.archivedRank || currentRank
    };
  } else if (request.operation === 'unarchive-entry') {
    const restoredRank = existingCard?.archivedRank || existingCard?.rank || existingDynamic?.rank || 1;
    entryPatch = { archived: false, archivedAt: '', rank: restoredRank };
    cardPatch = { archived: false, archivedAt: '', rank: restoredRank };
  }

  const imageData = request.image ? await loadImage(request.image, repoRoot) : null;
  if (imageData) {
    await uploadImage(fetchImpl, baseUrl, token, request.key, imageData);
    const imageUrl = `/api/catalogue-image/${encodeURIComponent(request.key)}?v=${Date.parse(timestamp)}`;
    entryPatch.imageUrl = imageUrl;
    cardPatch.imageUrl = imageUrl;
  }

  let nextEntry = null;
  if (target === 'dynamic') {
    nextEntry = { ...(existingDynamic || {}), ...patchForDynamic(entryPatch), key: request.key };
    ensureNewDynamicMinimum(nextEntry);
  }

  let nextCard = mergeCard(existingCard, cardPatch);
  if (target === 'dynamic' && !existingCard) nextCard = mergeCard({}, { ...nextEntry, ...cardPatch });
  if (request.operation === 'replace-image' && !imageData) throw new Error('replace-image requires a valid image.');

  if (request.operation === 'upsert-entry' || request.operation === 'archive-entry' || request.operation === 'unarchive-entry') {
    if (target === 'dynamic') {
      const fallbackRank = nextEntry.rank ?? nextCard.rank ?? 1;
      const nextType = catalogueType(nextCard);
      nextCard = {
        ...nextCard,
        rank: nextCard.rank ?? fallbackRank,
        catalogueType: nextType,
        taster: nextType === 'taster',
        archived: nextCard.archived ?? Boolean(nextEntry.archived)
      };
    }
    state.cards = reorderForTarget(state.cards, request.key, nextCard, timestamp, state.sections);
    nextCard = state.cards[request.key];
    if (target === 'dynamic') {
      if (nextCard.archived) delete nextEntry.rank;
      else nextEntry.rank = nextCard.rank;
      nextEntry.taster = Boolean(nextCard.taster);
      nextEntry.archived = Boolean(nextCard.archived);
      nextEntry.archivedAt = String(nextCard.archivedAt || '');
    }
  } else {
    state.cards[request.key] = nextCard;
  }

  assertRankingInvariant(state.cards, 'Catalogue write', state.sections);

  // Inserting or moving a card shifts the ranks of the others in its cohort, but only the
  // published key's entry was being resynced. A dynamic entry renders from its own rank,
  // not its card's, so every displaced entry kept its old number and two cards ended up
  // claiming the same position. putState writes cards and sections only, so each displaced
  // entry needs its own write.
  const displacedEntries = [];
  for (const [key, entry] of Object.entries(state.entries)) {
    if (key === request.key || !isRecord(entry)) continue;
    const card = state.cards[key];
    if (!isRecord(card) || card.archived) continue;
    const cardRank = Number(card.rank);
    if (!Number.isFinite(cardRank) || Number(entry.rank) === cardRank) continue;
    displacedEntries.push([key, { ...entry, rank: cardRank }]);
  }
  for (const [key, entry] of displacedEntries) {
    await putEntry(fetchImpl, baseUrl, token, key, entry);
    state.entries[key] = entry;
  }

  if (target === 'dynamic') await putEntry(fetchImpl, baseUrl, token, request.key, nextEntry);
  await putState(fetchImpl, baseUrl, token, state);

  let savedEntry = null;
  if (target === 'dynamic') {
    savedEntry = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-entry/${encodeURIComponent(request.key)}`, { headers: { accept: 'application/json' }, cache: 'no-store' }, 'Entry read-back');
    savedEntry = isRecord(savedEntry?.entry) ? savedEntry.entry : savedEntry;
    const expectedKeys = new Set([...intendedKeys(request)].filter(key => key !== 'catalogueType' && key !== 'archivedRank' && key !== 'laurel' && key !== 'productionHtml' && key !== 'practicalHtml'));
    if (request.operation === 'unarchive-entry') expectedKeys.add('rank');
    assertSubset(savedEntry, nextEntry, expectedKeys, 'Entry read-back');
  }

  const verifiedStateRaw = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=1`, { headers: { accept: 'application/json' }, cache: 'no-store' }, 'Catalogue state read-back');
  const verifiedState = normaliseStateShape(verifiedStateRaw);
  assertRankingInvariant(verifiedState.cards, 'Catalogue state read-back', verifiedState.sections);
  const savedCard = verifiedState.cards[request.key];
  if (!isRecord(savedCard)) throw new Error(`Catalogue state read-back is missing card "${request.key}".`);
  const cardKeys = new Set([...intendedKeys(request)].filter(key => !DYNAMIC_ONLY_FIELDS.has(key) && key !== 'productionLines' && key !== 'practicalLines'));
  if (request.operation === 'unarchive-entry') cardKeys.add('rank');
  assertSubset(savedCard, nextCard, cardKeys, 'Catalogue state read-back');

  const html = await fetchProductionHtml(fetchImpl, `${baseUrl}/?catalogue_verify=${encodeURIComponent(request.key)}`, sleep);
  const keyPattern = new RegExp(`\\bdata-key=["']${escapeRegex(request.key)}["']`, 'i');
  if (!keyPattern.test(html)) throw new Error(`Catalogue key "${request.key}" is saved in KV but not represented in production HTML.`);

  return { ok: true, operation: request.operation, key: request.key, target, image: Boolean(imageData), verified: true };
}

export async function publishRequestFile(requestPath, options = {}) {
  const absolutePath = resolve(options.repoRoot || process.cwd(), requestPath);
  const body = await readFile(absolutePath, 'utf8');
  let parsed;
  try { parsed = JSON.parse(body); }
  catch { throw new Error(`Invalid JSON in request file: ${requestPath}`); }
  return publishRequestDocument(parsed, options);
}

async function main(argv) {
  const requestPath = argv[2];
  if (!requestPath) throw new Error('Usage: node scripts/publish-catalogue-request.mjs <catalogue-requests/request.json>');
  const result = await publishRequestFile(requestPath);
  const subject = result.key ? ` for ${result.key}` : '';
  console.log(`Published ${result.operation}${subject}; KV and production rendering verified.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main(process.argv).catch(error => {
    console.error(`Catalogue publication failed: ${error.message}`);
    process.exitCode = 1;
  });
}
