#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COHORTS,
  rankRecommendationRows,
  recommendationCohortForMainCard
} from '../public/catalogue-recommendation-cohorts.mjs';

export const DEFAULT_BASE_URL = 'https://cigar-catalogue.psncodex.workers.dev';
const OPERATION = 'seed-recommendation-ranks';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(key) ? key : '';
}

function htmlAttribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '';
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<br\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classText(fragment, className) {
  const escaped = String(className).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<([a-z0-9]+)\\b[^>]*\\bclass\\s*=\\s*(["'])[^"']*(?:^|\\s)${escaped}(?:\\s|$)[^"']*\\2[^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i'
  );
  const match = String(fragment || '').match(pattern);
  return match ? decodeEntities(match[3]) : '';
}

function optionalPositiveRank(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.round(number) : null;
}

function catalogueType(source = {}, live = {}) {
  const explicit = String(source.catalogueType || live.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || source.taster === true || live.taster === true) return 'taster';
  return 'main';
}

function mergedSource(state, key) {
  const entry = isRecord(state.entries?.[key]) ? state.entries[key] : {};
  const card = isRecord(state.cards?.[key]) ? state.cards[key] : {};
  return { ...entry, ...card };
}

function explicitFlavoured(source = {}) {
  if (typeof source.flavoured === 'boolean') return source.flavoured;
  if (typeof source.infused === 'boolean') return source.infused;
  return null;
}

function isUnavailable(source = {}, live = {}) {
  if (source.archived === true || live.archived === true) return true;
  const stock = String(source.stockPin || source.stock || live.stockPin || live.stock || '').trim().toLowerCase();
  return stock === 'out' || stock === 'delisted' || live.unavailable === true;
}

function validateRequest(request) {
  if (!isRecord(request) || request.operation !== OPERATION) {
    throw new Error(`Recommendation rank seed request must use operation "${OPERATION}".`);
  }
  return clone(request);
}

function scrubRecommendationMetadata(inputState) {
  const state = clone(isRecord(inputState) ? inputState : {});
  if (!isRecord(state.cards)) state.cards = {};
  for (const [key, raw] of Object.entries(state.cards)) {
    if (!isRecord(raw)) continue;
    const card = { ...raw };
    delete card.recommendationCohort;
    delete card.recommendationRank;
    if (Object.keys(card).length === 0) delete state.cards[key];
    else state.cards[key] = card;
  }
  return state;
}

function assertOnlyRecommendationMetadataChanged(before, after) {
  assert.deepEqual(
    scrubRecommendationMetadata(after),
    scrubRecommendationMetadata(before),
    'Recommendation rank seed attempted to change a field outside recommendationCohort/recommendationRank.'
  );
}

function assertContiguousRankings(rankings) {
  for (const cohort of COHORTS) {
    const rows = Array.isArray(rankings?.[cohort]) ? rankings[cohort] : [];
    rows.forEach((row, index) => {
      assert.equal(row.rank, index + 1, `${cohort} recommendation ranks are not contiguous.`);
    });
  }
}

function assertJoyaBlackIsNotFlavoured(rankings) {
  const joyaKey = 'joya-black-cigarillo';
  const coronets = rankings.coronets || [];
  const flavoured = rankings.flavoured || [];
  if (coronets.some(row => row.key === joyaKey)) {
    assert.equal(flavourRow(rankings, joyaKey), null, 'JOYA Black was also assigned to Flavoured.');
  }
  function flavourRow(all, key) {
    return (all.flavoured || []).find(row => row.key === key) || null;
  }
}

function headersWithAuth(token, headers = {}) {
  const output = new Headers(headers);
  output.set('authorization', `Bearer ${token}`);
  return output;
}

async function checkedJson(response, label, token = '') {
  if (!response.ok) {
    let body = String(await response.text().catch(() => '')).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 400);
    if (token) body = body.split(String(token)).join('[REDACTED]');
    throw new Error(`${label} failed with HTTP ${response.status}${body ? `: ${body}` : ''}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

async function checkedHtml(response, label) {
  if (!response.ok) {
    const body = String(await response.text().catch(() => '')).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 400);
    throw new Error(`${label} failed with HTTP ${response.status}${body ? `: ${body}` : ''}`);
  }
  const html = await response.text();
  if (!/<article\b[^>]*\bdata-key=["'][^"']+["'][^>]*>/i.test(html)) {
    throw new Error(`${label} did not contain catalogue cards.`);
  }
  return html;
}

export function parseLiveRecommendationCards(html) {
  const rows = [];
  const source = String(html || '');
  const articleRx = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = articleRx.exec(source))) {
    const openingTag = `<article${match[1]}>`;
    const className = htmlAttribute(openingTag, 'class');
    if (!/(?:^|\s)card(?:\s|$)/i.test(className)) continue;
    const key = safeKey(htmlAttribute(openingTag, 'data-key'));
    if (!key) continue;

    const body = match[2];
    const directRing = Number(htmlAttribute(openingTag, 'data-ring'));
    const visualRingMatch = body.match(/<[^>]+\bdata-visual-ring\s*=\s*(["'])(\d+(?:\.\d+)?)\1/i);
    const textRingMatch = decodeEntities(body).match(/\b(\d{1,2})\s*(?:RG|ring gauge)\b/i);
    const ring = Number.isFinite(directRing) && directRing > 0
      ? directRing
      : Number(visualRingMatch?.[2] || textRingMatch?.[1] || 0);

    rows.push({
      key,
      rank: optionalPositiveRank(htmlAttribute(openingTag, 'data-rank')),
      archived: htmlAttribute(openingTag, 'data-archived') === '1',
      taster: htmlAttribute(openingTag, 'data-taster') === '1',
      catalogueType: htmlAttribute(openingTag, 'data-catalogue-type'),
      stock: htmlAttribute(openingTag, 'data-stock'),
      stockPin: htmlAttribute(openingTag, 'data-stock-pin'),
      unavailable: /(?:^|\s)is-unavailable(?:\s|$)/i.test(className),
      ring,
      productionText: classText(body, 'artmeta-left')
    });
  }

  return rows;
}

export function buildRecommendationRankSeed(inputState, liveHtml) {
  const original = isRecord(inputState) ? inputState : {};
  const state = clone(original);
  if (!isRecord(state.cards)) state.cards = {};
  if (!isRecord(state.entries)) state.entries = {};
  if (!isRecord(state.sections)) state.sections = {};

  const liveCards = parseLiveRecommendationCards(liveHtml);
  const rows = [];

  for (const live of liveCards) {
    const source = mergedSource(state, live.key);
    if (catalogueType(source, live) !== 'main' || isUnavailable(source, live)) continue;

    const sourceRing = Number(source.ring);
    const ring = Number.isFinite(sourceRing) && sourceRing > 0 ? sourceRing : live.ring;
    if (!Number.isFinite(ring) || ring <= 0) continue;

    const structuredProduction = [
      ...(Array.isArray(source.productionLines) ? source.productionLines : []),
      source.productionHtml || ''
    ].join(' ').trim();
    const productionText = structuredProduction || live.productionText;
    const cohort = recommendationCohortForMainCard({
      key: live.key,
      ring,
      productionText,
      explicitFlavoured: explicitFlavoured(source)
    });
    if (!cohort) continue;

    rows.push({
      key: live.key,
      cohort,
      persistedCohort: COHORTS.includes(source.recommendationCohort) ? source.recommendationCohort : '',
      recommendationRank: optionalPositiveRank(source.recommendationRank),
      legacyRank: live.rank ?? optionalPositiveRank(source.rank) ?? Number.MAX_SAFE_INTEGER
    });
  }

  const ranked = rankRecommendationRows(rows);
  const changedKeys = [];
  const rankings = Object.fromEntries(COHORTS.map(cohort => [cohort, []]));

  for (const row of rows) {
    const assignment = ranked[row.key];
    if (!assignment) continue;
    const previous = isRecord(state.cards[row.key]) ? state.cards[row.key] : {};
    if (previous.recommendationCohort !== assignment.cohort || previous.recommendationRank !== assignment.rank) {
      changedKeys.push(row.key);
    }
    state.cards[row.key] = {
      ...previous,
      recommendationCohort: assignment.cohort,
      recommendationRank: assignment.rank
    };
    rankings[assignment.cohort].push({ key: row.key, rank: assignment.rank });
  }

  for (const cohort of COHORTS) {
    rankings[cohort].sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
  }

  return { state, rankings, changedKeys: changedKeys.sort() };
}

export async function publishRecommendationRankSeedDocument(inputRequest, options = {}) {
  const request = validateRequest(inputRequest);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const token = String(options.token || process.env.CATALOGUE_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for recommendation rank seeding.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const stateUrl = `${baseUrl}/api/catalogue-overrides`;

  const before = await checkedJson(
    await fetchImpl(stateUrl, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' }),
    'Live catalogue state read'
  );

  const liveHtml = await checkedHtml(
    await fetchImpl(`${baseUrl}/?catalogue_source=recommendation-rank-seed`, {
      method: 'GET', headers: { accept: 'text/html' }, cache: 'no-store'
    }),
    'Live catalogue HTML read'
  );

  const seeded = buildRecommendationRankSeed(before, liveHtml);
  assertOnlyRecommendationMetadataChanged(before, seeded.state);
  assertContiguousRankings(seeded.rankings);
  assertJoyaBlackIsNotFlavoured(seeded.rankings);

  await checkedJson(
    await fetchImpl(stateUrl, {
      method: 'PUT',
      headers: headersWithAuth(token, { accept: 'application/json', 'content-type': 'application/json' }),
      body: JSON.stringify(seeded.state)
    }),
    'Recommendation rank seed write',
    token
  );

  const readBack = await checkedJson(
    await fetchImpl(`${stateUrl}?verify=${Date.now()}`, {
      method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store'
    }),
    'Recommendation rank seed read-back'
  );
  assert.deepEqual(readBack, seeded.state, 'Live KV read-back did not exactly match the seeded recommendation rank state.');
  assertOnlyRecommendationMetadataChanged(before, readBack);

  const verified = buildRecommendationRankSeed(readBack, liveHtml);
  assert.deepEqual(verified.rankings, seeded.rankings, 'Persisted recommendation ranks do not reproduce the seeded subsection ordering.');
  assertContiguousRankings(verified.rankings);
  assertJoyaBlackIsNotFlavoured(verified.rankings);

  const productionHtml = await checkedHtml(
    await fetchImpl(`${baseUrl}/?catalogue_source=recommendation-rank-seed-verify`, {
      method: 'GET', headers: { accept: 'text/html' }, cache: 'no-store'
    }),
    'Production catalogue verification'
  );
  for (const key of seeded.changedKeys) {
    assert.match(productionHtml, new RegExp(`data-key=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i'), `Production catalogue is missing seeded card ${key}.`);
  }

  return {
    ok: true,
    operation: request.operation,
    verified: true,
    rankings: seeded.rankings,
    changedKeys: seeded.changedKeys
  };
}

export async function publishRecommendationRankSeedFile(requestPath, options = {}) {
  const request = JSON.parse(await readFile(resolve(requestPath), 'utf8'));
  return publishRecommendationRankSeedDocument(request, options);
}

async function main(argv) {
  const requestPath = argv[2];
  if (!requestPath) throw new Error('Usage: node scripts/seed-live-recommendation-ranks.mjs <catalogue-requests/request.json>');
  const result = await publishRecommendationRankSeedFile(requestPath);
  console.log('Seeded independent recommendation subsection ranks from current live state; KV read-back and production rendering verified.');
  console.log(`RECOMMENDATION_RANK_SEED_RESULT ${JSON.stringify(result)}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main(process.argv).catch(error => {
    console.error(`Recommendation rank seed failed: ${error.message}`);
    process.exitCode = 1;
  });
}
