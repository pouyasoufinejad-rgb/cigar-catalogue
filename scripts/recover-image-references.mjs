#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VERIFY_RETRY_DELAYS = [2000, 5000, 10000];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(key) ? key : '';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function validateImageReference(key, value) {
  const imageUrl = String(value || '').trim();
  const expectedPath = `/api/catalogue-image/${encodeURIComponent(key)}`;
  let parsed;
  try {
    parsed = new URL(imageUrl, 'https://catalogue.invalid');
  } catch {
    throw new Error(`Invalid image reference for ${key}.`);
  }
  if (!imageUrl.startsWith('/') || parsed.origin !== 'https://catalogue.invalid' || parsed.pathname !== expectedPath) {
    throw new Error(`Invalid image reference for ${key}; expected ${expectedPath}.`);
  }
  return `${parsed.pathname}${parsed.search}`;
}

function validateArchivedEntries(value) {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error('archivedEntries must be an object.');
  const archivedEntries = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = safeKey(rawKey);
    if (!key || key !== rawKey) throw new Error(`Invalid catalogue key in archivedEntries: ${rawKey}.`);
    if (!isRecord(rawValue)) throw new Error(`Archive recovery for ${key} must be an object.`);
    const entry = {};
    if (own(rawValue, 'archivedRank')) {
      const rank = Number(rawValue.archivedRank);
      if (!Number.isInteger(rank) || rank < 1 || rank > 10000) throw new Error(`Invalid archivedRank for ${key}.`);
      entry.archivedRank = rank;
    }
    if (own(rawValue, 'archivedAt')) {
      const archivedAt = String(rawValue.archivedAt || '').trim();
      if (!archivedAt || Number.isNaN(Date.parse(archivedAt))) throw new Error(`Invalid archivedAt for ${key}.`);
      entry.archivedAt = archivedAt;
    }
    archivedEntries[key] = entry;
  }
  return archivedEntries;
}

function validateVersionTag(value) {
  const tag = String(value || '').trim();
  if (!tag) return 'recovery-latest';
  if (!/^[A-Za-z0-9._-]{1,96}$/.test(tag)) throw new Error('imageVersionTag contains unsupported characters.');
  return tag;
}

export function validateRecoveryManifest(input) {
  if (!isRecord(input)) throw new Error('Recovery manifest must be a JSON object.');
  const imageReferences = {};
  if (input.imageReferences !== undefined) {
    if (!isRecord(input.imageReferences)) throw new Error('imageReferences must be an object.');
    for (const [rawKey, value] of Object.entries(input.imageReferences)) {
      const key = safeKey(rawKey);
      if (!key || key !== rawKey) throw new Error(`Invalid catalogue key in recovery manifest: ${rawKey}.`);
      imageReferences[key] = validateImageReference(key, value);
    }
  }
  const archivedEntries = validateArchivedEntries(input.archivedEntries);
  const restoreLatestImages = input.restoreLatestImages === true;
  if (!Object.keys(imageReferences).length && !Object.keys(archivedEntries).length && !restoreLatestImages) {
    throw new Error('Recovery manifest requires imageReferences, archivedEntries, or restoreLatestImages.');
  }
  return {
    id: String(input.id || '').trim(),
    note: String(input.note || '').trim(),
    imageReferences,
    archivedEntries,
    restoreLatestImages,
    imageVersionTag: validateVersionTag(input.imageVersionTag)
  };
}

function articleForKey(html, key) {
  const pattern = new RegExp(`<article\\b(?=[^>]*\\bdata-key=["']${escapeRegex(key)}["'])[^>]*>[\\s\\S]*?<\\/article>`, 'i');
  return String(html || '').match(pattern)?.[0] || '';
}

function articleHasImageUrl(article, imageUrl) {
  if (!article) return false;
  return article.includes(`src="${imageUrl}"`) || article.includes(`src='${imageUrl}'`);
}

function articleIsArchived(article, archivedRank) {
  if (!article || !/\bdata-archived=["']1["']/i.test(article)) return false;
  if (Number.isInteger(archivedRank) && archivedRank > 0) {
    const rankRx = new RegExp(`\\bdata-archived-rank=["']${archivedRank}["']`, 'i');
    if (!rankRx.test(article)) return false;
  }
  return !/\bdata-rank=["'][^"']+["']/i.test(article.match(/^<article\b[^>]*>/i)?.[0] || '');
}

function catalogueKeysFromHtml(html) {
  const keys = new Set();
  const rx = /\bdata-key=["']([a-z0-9][a-z0-9_-]{0,95})["']/gi;
  for (const match of String(html || '').matchAll(rx)) keys.add(match[1].toLowerCase());
  return [...keys];
}

async function fetchProductionHtml(fetchImpl, baseUrl, queryName, attempt = 0) {
  const response = await fetchImpl(`${baseUrl}/?${queryName}=${attempt}-${Date.now()}`, {
    method:'GET', headers:{ accept:'text/html' }, cache:'no-store'
  });
  if (!response.ok) throw await responseError(response, 'Production catalogue read');
  return response.text();
}

async function verifyProduction(fetchImpl, baseUrl, imageReferences, archivedCards, sleep) {
  const imageKeys = Object.keys(imageReferences);
  const archiveKeys = Object.keys(archivedCards);
  for (let attempt = 0; attempt <= VERIFY_RETRY_DELAYS.length; attempt += 1) {
    const response = await fetchImpl(`${baseUrl}/?catalogue_image_recovery=${attempt}-${Date.now()}`, {
      method:'GET', headers:{ accept:'text/html' }, cache:'no-store'
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === VERIFY_RETRY_DELAYS.length) throw await responseError(response, 'Production catalogue verification');
    } else {
      const html = await response.text();
      const missingImage = imageKeys.find(key => !articleHasImageUrl(articleForKey(html, key), imageReferences[key]));
      const missingArchive = archiveKeys.find(key => !articleIsArchived(articleForKey(html, key), archivedCards[key]?.archivedRank));
      if (!missingImage && !missingArchive) return;
      if (attempt === VERIFY_RETRY_DELAYS.length) {
        if (missingImage) throw new Error(`Production image verification is missing restored image for ${missingImage}.`);
        throw new Error(`Production archive verification is missing restored archive state for ${missingArchive}.`);
      }
    }
    await sleep(VERIFY_RETRY_DELAYS[attempt]);
  }
}

async function verifyImageBlob(fetchImpl, baseUrl, key, { allowMissing = false } = {}) {
  const imageResponse = await fetchImpl(`${baseUrl}/api/catalogue-image/${encodeURIComponent(key)}`, {
    method:'HEAD', cache:'no-store'
  });
  if (allowMissing && imageResponse.status === 404) return false;
  if (!imageResponse.ok) throw new Error(`Image blob ${key} verification failed with HTTP ${imageResponse.status}.`);
  const contentType = (imageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`Image blob ${key} has unsupported content type ${contentType || '(missing)'}.`);
  }
  return true;
}

function removeArchivedKeysFromSections(sections, archivedKeys) {
  const archived = new Set(archivedKeys);
  const subsections = sections?.recommendationSubsections;
  if (!Array.isArray(subsections) || !archived.size) return;
  for (const subsection of subsections) {
    if (!isRecord(subsection) || !Array.isArray(subsection.entryKeys)) continue;
    subsection.entryKeys = subsection.entryKeys.filter(key => !archived.has(String(key || '').trim().toLowerCase()));
  }
}

export async function recoverImageReferences(input, options = {}) {
  const manifest = validateRecoveryManifest(input);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for catalogue recovery.');
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));

  const state = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides`, {
    headers:{ accept:'application/json' }, cache:'no-store'
  }, 'Catalogue state read');
  const entries = isRecord(state.entries) ? state.entries : {};
  const cards = isRecord(state.cards) ? clone(state.cards) : {};
  const sections = isRecord(state.sections) ? clone(state.sections) : {};
  const imageReferences = { ...manifest.imageReferences };
  let sourceHtml = '';
  let sourceKeys = null;

  async function ensureSourceKeys() {
    if (sourceKeys) return sourceKeys;
    sourceHtml = await fetchProductionHtml(fetchImpl, baseUrl, 'catalogue_recovery_source');
    sourceKeys = new Set(catalogueKeysFromHtml(sourceHtml));
    return sourceKeys;
  }

  if (manifest.restoreLatestImages) {
    const keys = [...await ensureSourceKeys()];
    for (const key of keys) {
      if (own(imageReferences, key)) continue;
      if (await verifyImageBlob(fetchImpl, baseUrl, key, { allowMissing:true })) {
        imageReferences[key] = `/api/catalogue-image/${encodeURIComponent(key)}?v=${encodeURIComponent(manifest.imageVersionTag)}`;
      }
    }
  }

  for (const [key, imageUrl] of Object.entries(manifest.imageReferences)) {
    if (!isRecord(entries[key]) && !isRecord(cards[key])) {
      const liveKeys = await ensureSourceKeys();
      if (!liveKeys.has(key)) throw new Error(`Catalogue key "${key}" does not exist.`);
    }
    await verifyImageBlob(fetchImpl, baseUrl, key);
    imageReferences[key] = imageUrl;
  }

  const archivedCards = {};
  for (const [key, archiveSpec] of Object.entries(manifest.archivedEntries)) {
    if (!isRecord(entries[key]) && !isRecord(cards[key])) {
      const liveKeys = await ensureSourceKeys();
      if (!liveKeys.has(key)) throw new Error(`Catalogue key "${key}" does not exist.`);
    }
    const currentCard = isRecord(cards[key]) ? cards[key] : {};
    const currentEntry = isRecord(entries[key]) ? entries[key] : {};
    const fallbackRank = [archiveSpec.archivedRank, currentCard.archivedRank, currentEntry.archivedRank, currentCard.rank, currentEntry.rank]
      .map(value => Number(value))
      .find(value => Number.isInteger(value) && value > 0);
    const nextCard = { ...currentCard, archived:true };
    delete nextCard.rank;
    if (fallbackRank) nextCard.archivedRank = fallbackRank;
    if (archiveSpec.archivedAt) nextCard.archivedAt = archiveSpec.archivedAt;
    else if (currentCard.archivedAt) nextCard.archivedAt = currentCard.archivedAt;
    else if (currentEntry.archivedAt) nextCard.archivedAt = currentEntry.archivedAt;
    cards[key] = nextCard;
    archivedCards[key] = nextCard;
  }
  removeArchivedKeysFromSections(sections, Object.keys(archivedCards));

  for (const [key, imageUrl] of Object.entries(imageReferences)) {
    cards[key] = { ...(isRecord(cards[key]) ? cards[key] : {}), imageUrl };
    if (archivedCards[key]) archivedCards[key] = cards[key];
  }

  const writeBody = { version:3, cards, sections };
  await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides`, {
    method:'PUT',
    headers:buildHeaders(token, { 'content-type':'application/json' }),
    body:JSON.stringify(writeBody)
  }, 'Catalogue recovery write', token);

  const verifiedState = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=image-recovery`, {
    headers:{ accept:'application/json' }, cache:'no-store'
  }, 'Catalogue recovery read-back');
  const verifiedCards = isRecord(verifiedState.cards) ? verifiedState.cards : {};
  for (const key of new Set([...Object.keys(imageReferences), ...Object.keys(archivedCards)])) {
    assert.deepEqual(verifiedCards[key], cards[key], `Read-back card changed unexpectedly for ${key}`);
  }
  assert.deepEqual(verifiedState.sections, sections, 'Read-back sections changed unexpectedly');

  await verifyProduction(fetchImpl, baseUrl, imageReferences, archivedCards, sleep);
  return {
    ok:true,
    recovered:Object.keys(imageReferences).length,
    archived:Object.keys(archivedCards).length,
    id:manifest.id
  };
}

export async function recoverImageReferencesFile(manifestPath, options = {}) {
  const absolute = resolve(options.repoRoot || process.cwd(), manifestPath);
  const body = await readFile(absolute, 'utf8');
  let parsed;
  try { parsed = JSON.parse(body); }
  catch { throw new Error(`Invalid JSON in recovery manifest: ${manifestPath}`); }
  return recoverImageReferences(parsed, options);
}

async function main(argv) {
  const manifestPath = argv[2];
  if (!manifestPath) throw new Error('Usage: node scripts/recover-image-references.mjs <catalogue-recovery/manifest.json>');
  const result = await recoverImageReferencesFile(manifestPath);
  console.log(`Recovered ${result.recovered} catalogue image reference(s) and ${result.archived} archive state(s); KV and production rendering verified.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main(process.argv).catch(error => {
    console.error(`Catalogue recovery failed: ${error.message}`);
    process.exitCode = 1;
  });
}
