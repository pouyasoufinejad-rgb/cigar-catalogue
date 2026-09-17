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

export function validateRecoveryManifest(input) {
  if (!isRecord(input)) throw new Error('Recovery manifest must be a JSON object.');
  if (!isRecord(input.imageReferences) || !Object.keys(input.imageReferences).length) {
    throw new Error('Recovery manifest requires a non-empty imageReferences object.');
  }
  const imageReferences = {};
  for (const [rawKey, value] of Object.entries(input.imageReferences)) {
    const key = safeKey(rawKey);
    if (!key || key !== rawKey) throw new Error(`Invalid catalogue key in recovery manifest: ${rawKey}.`);
    imageReferences[key] = validateImageReference(key, value);
  }
  return {
    id: String(input.id || '').trim(),
    note: String(input.note || '').trim(),
    imageReferences
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

async function verifyProduction(fetchImpl, baseUrl, imageReferences, sleep) {
  const keys = Object.keys(imageReferences);
  for (let attempt = 0; attempt <= VERIFY_RETRY_DELAYS.length; attempt += 1) {
    const response = await fetchImpl(`${baseUrl}/?catalogue_image_recovery=${attempt}-${Date.now()}`, {
      method:'GET', headers:{ accept:'text/html' }, cache:'no-store'
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === VERIFY_RETRY_DELAYS.length) throw await responseError(response, 'Production image verification');
    } else {
      const html = await response.text();
      const missing = keys.filter(key => !articleHasImageUrl(articleForKey(html, key), imageReferences[key]));
      if (!missing.length) return;
      if (attempt === VERIFY_RETRY_DELAYS.length) {
        throw new Error(`Production image verification is missing restored image for ${missing[0]}.`);
      }
    }
    await sleep(VERIFY_RETRY_DELAYS[attempt]);
  }
}

export async function recoverImageReferences(input, options = {}) {
  const manifest = validateRecoveryManifest(input);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for image recovery.');
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));

  const state = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides`, {
    headers:{ accept:'application/json' }, cache:'no-store'
  }, 'Catalogue state read');
  const entries = isRecord(state.entries) ? state.entries : {};
  const cards = isRecord(state.cards) ? clone(state.cards) : {};
  const sections = isRecord(state.sections) ? clone(state.sections) : {};

  for (const [key, imageUrl] of Object.entries(manifest.imageReferences)) {
    if (!isRecord(entries[key]) && !isRecord(cards[key])) throw new Error(`Catalogue key "${key}" does not exist.`);
    const imageResponse = await fetchImpl(`${baseUrl}/api/catalogue-image/${encodeURIComponent(key)}`, {
      method:'HEAD', cache:'no-store'
    });
    if (!imageResponse.ok) throw new Error(`Image blob ${key} verification failed with HTTP ${imageResponse.status}.`);
    const contentType = (imageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error(`Image blob ${key} has unsupported content type ${contentType || '(missing)'}.`);
    }
    cards[key] = { ...(isRecord(cards[key]) ? cards[key] : {}), imageUrl };
  }

  const writeBody = { version:3, cards, sections };
  await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides`, {
    method:'PUT',
    headers:buildHeaders(token, { 'content-type':'application/json' }),
    body:JSON.stringify(writeBody)
  }, 'Catalogue image-reference write', token);

  const verifiedState = await fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=image-recovery`, {
    headers:{ accept:'application/json' }, cache:'no-store'
  }, 'Catalogue image-reference read-back');
  const verifiedCards = isRecord(verifiedState.cards) ? verifiedState.cards : {};
  for (const [key, imageUrl] of Object.entries(manifest.imageReferences)) {
    assert.equal(verifiedCards[key]?.imageUrl, imageUrl, `Read-back imageUrl mismatch for ${key}`);
    const expectedCard = cards[key];
    assert.deepEqual(verifiedCards[key], expectedCard, `Read-back card changed unexpectedly for ${key}`);
  }

  await verifyProduction(fetchImpl, baseUrl, manifest.imageReferences, sleep);
  return { ok:true, recovered:Object.keys(manifest.imageReferences).length, id:manifest.id };
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
  console.log(`Recovered ${result.recovered} catalogue image reference(s); KV and production rendering verified.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main(process.argv).catch(error => {
    console.error(`Catalogue image recovery failed: ${error.message}`);
    process.exitCode = 1;
  });
}
