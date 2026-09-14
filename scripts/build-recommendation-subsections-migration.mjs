#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  buildLegacyRecommendationSubsections
} from '../public/catalogue-recommendation-legacy.mjs';
import {
  normaliseCatalogueType,
  assertRecommendationInventory
} from '../public/catalogue-structure.mjs';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(key) ? key : '';
}

function htmlAttribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(tag || '').match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? '';
}

function stripMarkup(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function productionTextFromArticle(body) {
  const source = String(body || '');
  const match = source.match(/<([a-z0-9]+)\b[^>]*class\s*=\s*(["'])[^"']*\bartmeta-left\b[^"']*\2[^>]*>([\s\S]*?)<\/\1>/i);
  return match ? stripMarkup(match[3]) : '';
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function ringFromArticle(openTag, body) {
  const direct = numberOrNull(htmlAttribute(openTag, 'data-ring'));
  if (direct) return direct;
  const visualMatch = String(body || '').match(/\bdata-visual-ring\s*=\s*(["'])(\d{1,2}(?:\.\d+)?)\1/i);
  if (visualMatch) return Number(visualMatch[2]);
  const text = stripMarkup(body);
  const rg = text.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:RG|ring gauge)\b/i);
  if (rg) return Number(rg[1]);
  const size = text.match(/\b\d+(?:\.\d+)?\s*(?:in|inch|inches|\")?\s*[x×]\s*(\d{1,2})\b/i);
  return size ? Number(size[1]) : 0;
}

export function parseCatalogueRows(html) {
  const source = String(html || '');
  const rows = [];
  const pattern = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
  for (const match of source.matchAll(pattern)) {
    const openTag = `<article${match[1]}>`;
    const key = safeKey(htmlAttribute(openTag, 'data-key'));
    if (!key) continue;
    const taster = htmlAttribute(openTag, 'data-taster') === '1';
    const explicitType = htmlAttribute(openTag, 'data-catalogue-type');
    const archived = htmlAttribute(openTag, 'data-archived') === '1';
    const rank = numberOrNull(htmlAttribute(openTag, 'data-rank'));
    const recommendationRank = numberOrNull(htmlAttribute(openTag, 'data-recommendation-rank'));
    rows.push({
      key,
      catalogueType: normaliseCatalogueType(explicitType, taster),
      taster,
      archived,
      ring: ringFromArticle(openTag, match[2]),
      productionText: productionTextFromArticle(match[2]),
      recommendationCohort: String(htmlAttribute(openTag, 'data-recommendation-cohort') || '').trim(),
      recommendationRank,
      legacyRank: rank,
      rank
    });
  }
  return rows;
}

function mergedStateSource(state, key) {
  const entry = isRecord(state?.entries?.[key]) ? state.entries[key] : {};
  const card = isRecord(state?.cards?.[key]) ? state.cards[key] : {};
  return { ...entry, ...card };
}

export function mergeStateIntoRows(rows, state = {}) {
  const byKey = new Map((Array.isArray(rows) ? rows : []).map(row => [row.key, { ...row }]));
  const keys = new Set([
    ...byKey.keys(),
    ...Object.keys(isRecord(state.entries) ? state.entries : {}),
    ...Object.keys(isRecord(state.cards) ? state.cards : {})
  ]);

  for (const key of keys) {
    const safe = safeKey(key);
    if (!safe) continue;
    const row = byKey.get(safe) || { key: safe };
    const source = mergedStateSource(state, safe);
    const type = normaliseCatalogueType(source.catalogueType ?? row.catalogueType, source.taster === true || row.taster === true);
    const productionText = [
      ...(Array.isArray(source.productionLines) ? source.productionLines : []),
      typeof source.productionHtml === 'string' ? stripMarkup(source.productionHtml) : ''
    ].filter(Boolean).join(' ').trim() || row.productionText || '';
    const ring = numberOrNull(source.ring) ?? numberOrNull(row.ring) ?? 0;
    const recommendationRank = numberOrNull(source.recommendationRank) ?? numberOrNull(row.recommendationRank);
    const legacyRank = numberOrNull(source.rank) ?? numberOrNull(row.legacyRank ?? row.rank);
    byKey.set(safe, {
      ...row,
      key: safe,
      catalogueType: type,
      taster: type === 'taster',
      archived: source.archived === true || (source.archived === undefined && row.archived === true),
      ring,
      productionText,
      flavoured: typeof source.flavoured === 'boolean' ? source.flavoured : row.flavoured,
      infused: typeof source.infused === 'boolean' ? source.infused : row.infused,
      recommendationCohort: String(source.recommendationCohort ?? row.recommendationCohort ?? '').trim(),
      recommendationRank,
      legacyRank,
      rank: legacyRank
    });
  }
  return [...byKey.values()];
}

export function buildMigrationRequest({ rows }) {
  const source = Array.isArray(rows) ? rows : [];
  const recommendationSubsections = buildLegacyRecommendationSubsections(source);
  assertRecommendationInventory({
    subsections: recommendationSubsections,
    activeRecommendationKeys: source
      .filter(row => !row.archived && normaliseCatalogueType(row.catalogueType, Boolean(row.taster)) === 'main')
      .map(row => row.key),
    forbiddenKeys: source
      .filter(row => row.archived || normaliseCatalogueType(row.catalogueType, Boolean(row.taster)) !== 'main')
      .map(row => row.key)
  });
  return {
    id: '2026-09-14-migrate-recommendation-subsections',
    operation: 'update-recommendation-subsections',
    recommendationSubsections,
    note: 'One-time migration from legacy inferred Recommendation subsections to explicit v4 structure.'
  };
}

async function fetchText(fetchImpl, url, label) {
  const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'text/html' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.text();
}

async function fetchJson(fetchImpl, url, label) {
  const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.json();
}

export async function buildLiveMigrationRequest(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const [state, html] = await Promise.all([
    fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?migration_source=1`, 'Catalogue state read'),
    fetchText(fetchImpl, `${baseUrl}/?catalogue_source=recommendation_migration`, 'Catalogue HTML read')
  ]);
  const rows = mergeStateIntoRows(parseCatalogueRows(html), state);
  return buildMigrationRequest({ rows });
}

async function main() {
  const request = await buildLiveMigrationRequest();
  process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main().catch(error => {
    console.error(`Recommendation subsection migration build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
