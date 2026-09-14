#!/usr/bin/env node

import {
  COHORTS,
  rankRecommendationRows,
  recommendationCohortForMainCard
} from '../public/catalogue-recommendation-cohorts.mjs';

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
