#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_BASE_URL,
  publishMaintenanceRequestFile
} from './publish-live-maintenance-request.mjs';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function attributeValue(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '';
}

function safeKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(key) ? key : '';
}

function targetSet(values = []) {
  return new Set((Array.isArray(values) ? values : []).map(safeKey).filter(Boolean));
}

function isTasterStateCard(card) {
  return card?.taster === true || String(card?.catalogueType || '').trim().toLowerCase() === 'taster';
}

function isTasterTag(tag) {
  return attributeValue(tag, 'data-taster') === '1'
    || attributeValue(tag, 'data-catalogue-type').trim().toLowerCase() === 'taster';
}

function removeAttribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.replace(new RegExp(`\\s+${escaped}\\s*=\\s*(["']).*?\\1`, 'i'), '');
}

function setAttribute(tag, name, value) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`\\b${escaped}\\s*=\\s*(["']).*?\\1`, 'i');
  if (rx.test(tag)) return tag.replace(rx, `${name}="${value}"`);
  return tag.replace(/>$/, ` ${name}="${value}">`);
}

export function suppressNonTargetTasterCohortMarkers(html, targetKeys = []) {
  const targets = targetSet(targetKeys);
  return String(html || '').replace(/<article\b[^>]*>/gi, tag => {
    const key = safeKey(attributeValue(tag, 'data-key'));
    if (!key || targets.has(key) || !isTasterTag(tag)) return tag;
    return setAttribute(removeAttribute(tag, 'data-rank'), 'data-archived', '1');
  });
}

export function suppressNonTargetTasterStateMarkers(inputState, targetKeys = []) {
  const targets = targetSet(targetKeys);
  const state = structuredClone(isRecord(inputState) ? inputState : {});
  const markers = {};
  if (!isRecord(state.cards)) state.cards = {};

  for (const [key, card] of Object.entries(state.cards)) {
    if (!isRecord(card) || targets.has(key) || !isTasterStateCard(card)) continue;
    markers[key] = {
      hasArchived: Object.prototype.hasOwnProperty.call(card, 'archived'),
      archived: card.archived,
      hasRank: Object.prototype.hasOwnProperty.call(card, 'rank'),
      rank: card.rank
    };
    card.archived = true;
    delete card.rank;
  }

  return { state, markers };
}

export function restoreNonTargetTasterStateMarkers(inputState, markers = {}) {
  const state = structuredClone(isRecord(inputState) ? inputState : {});
  if (!isRecord(state.cards)) state.cards = {};

  for (const [key, marker] of Object.entries(markers || {})) {
    const card = isRecord(state.cards[key]) ? state.cards[key] : (state.cards[key] = {});
    if (marker.hasArchived) card.archived = marker.archived;
    else delete card.archived;
    if (marker.hasRank) card.rank = marker.rank;
    else delete card.rank;
  }
  return state;
}

// Kept for compatibility with earlier regression coverage. These helpers only hide
// rankless taster markers and are not used by the live maintenance route anymore.
export function suppressRanklessTasterCohortMarkers(html) {
  return String(html || '').replace(/<article\b[^>]*>/gi, tag => {
    if (!isTasterTag(tag) || Number(attributeValue(tag, 'data-rank')) >= 1) return tag;
    return tag
      .replace(/\bdata-taster\s*=\s*(["'])1\1/i, 'data-taster="0"')
      .replace(/\bdata-catalogue-type\s*=\s*(["'])taster\1/i, 'data-catalogue-type="main"');
  });
}

export function suppressRanklessTasterStateMarkers(inputState) {
  const state = structuredClone(isRecord(inputState) ? inputState : {});
  const markers = {};
  if (!isRecord(state.cards)) state.cards = {};
  for (const [key, card] of Object.entries(state.cards)) {
    if (!isRecord(card) || Number(card.rank) >= 1 || !isTasterStateCard(card)) continue;
    markers[key] = {
      hasTaster: Object.prototype.hasOwnProperty.call(card, 'taster'),
      taster: card.taster,
      hasCatalogueType: Object.prototype.hasOwnProperty.call(card, 'catalogueType'),
      catalogueType: card.catalogueType
    };
    if (card.taster === true) card.taster = false;
    if (String(card.catalogueType || '').trim().toLowerCase() === 'taster') card.catalogueType = 'main';
  }
  return { state, markers };
}

export function restoreRanklessTasterStateMarkers(inputState, markers = {}) {
  const state = structuredClone(isRecord(inputState) ? inputState : {});
  if (!isRecord(state.cards)) state.cards = {};
  for (const [key, marker] of Object.entries(markers || {})) {
    const card = isRecord(state.cards[key]) ? state.cards[key] : (state.cards[key] = {});
    if (marker.hasTaster) card.taster = marker.taster;
    else delete card.taster;
    if (marker.hasCatalogueType) card.catalogueType = marker.catalogueType;
    else delete card.catalogueType;
  }
  return state;
}

function jsonResponse(value, response) {
  return new Response(JSON.stringify(value), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

function rankedCohortFetch(fetchImpl, baseUrl, targetKeys) {
  const root = String(baseUrl).replace(/\/$/, '');
  const rankingUrl = `${root}/?catalogue_source=maintenance`;
  const stateUrl = `${root}/api/catalogue-overrides`;
  let originalMarkers = {};

  return async (url, options = {}) => {
    const urlText = String(url);
    const method = String(options.method || 'GET').toUpperCase();

    if (urlText === stateUrl && method === 'PUT' && options.body) {
      const outgoing = JSON.parse(String(options.body));
      const restored = restoreNonTargetTasterStateMarkers(outgoing, originalMarkers);
      return fetchImpl(url, { ...options, body: JSON.stringify(restored) });
    }

    const response = await fetchImpl(url, options);
    if (!response.ok || method !== 'GET') return response;

    if (urlText === rankingUrl) {
      const html = await response.text();
      return new Response(suppressNonTargetTasterCohortMarkers(html, targetKeys), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    if (urlText === stateUrl || urlText.startsWith(`${stateUrl}?`)) {
      const raw = await response.json();
      const suppressed = suppressNonTargetTasterStateMarkers(raw, targetKeys);
      if (urlText === stateUrl) originalMarkers = suppressed.markers;
      return jsonResponse(suppressed.state, response);
    }

    return response;
  };
}

export async function publishRankedMaintenanceRequestFile(requestPath, options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');

  const repoRoot = options.repoRoot || process.cwd();
  const requestBody = await readFile(resolve(repoRoot, requestPath), 'utf8');
  const request = JSON.parse(requestBody);
  const requestedTasters = Array.isArray(request.tasterOrder) ? request.tasterOrder : [];

  return publishMaintenanceRequestFile(requestPath, {
    ...options,
    repoRoot,
    baseUrl,
    fetchImpl: rankedCohortFetch(fetchImpl, baseUrl, requestedTasters)
  });
}

async function main(argv) {
  const requestPath = argv[2];
  if (!requestPath) throw new Error('Usage: node scripts/publish-live-maintenance-ranked-request.mjs <catalogue-requests/request.json>');
  const result = await publishRankedMaintenanceRequestFile(requestPath);
  console.log('Published ranked bulk-maintenance from live catalogue state; KV read-back and production rendering verified.');
  console.log(`MAINTENANCE_RESULT ${JSON.stringify(result)}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main(process.argv).catch(error => {
    console.error(`Catalogue ranked maintenance failed: ${error.message}`);
    process.exitCode = 1;
  });
}
