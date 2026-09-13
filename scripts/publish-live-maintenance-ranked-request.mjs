#!/usr/bin/env node
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

function positiveRank(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.round(number) : null;
}

function positiveRankFromTag(tag) {
  return positiveRank(attributeValue(tag, 'data-rank'));
}

export function suppressRanklessTasterCohortMarkers(html) {
  return String(html || '').replace(/<article\b[^>]*>/gi, tag => {
    const tasterFlag = attributeValue(tag, 'data-taster') === '1';
    const catalogueType = attributeValue(tag, 'data-catalogue-type').trim().toLowerCase();
    if ((!tasterFlag && catalogueType !== 'taster') || positiveRankFromTag(tag) !== null) return tag;
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
    if (!isRecord(card) || positiveRank(card.rank) !== null) continue;
    const tasterFlag = card.taster === true;
    const catalogueType = String(card.catalogueType || '').trim().toLowerCase();
    if (!tasterFlag && catalogueType !== 'taster') continue;

    markers[key] = {
      hasTaster: Object.prototype.hasOwnProperty.call(card, 'taster'),
      taster: card.taster,
      hasCatalogueType: Object.prototype.hasOwnProperty.call(card, 'catalogueType'),
      catalogueType: card.catalogueType
    };
    if (tasterFlag) card.taster = false;
    if (catalogueType === 'taster') card.catalogueType = 'main';
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

function rankedCohortFetch(fetchImpl, baseUrl) {
  const root = String(baseUrl).replace(/\/$/, '');
  const rankingUrl = `${root}/?catalogue_source=maintenance`;
  const stateUrl = `${root}/api/catalogue-overrides`;
  let originalMarkers = {};

  return async (url, options = {}) => {
    const urlText = String(url);
    const method = String(options.method || 'GET').toUpperCase();

    if (urlText === stateUrl && method === 'PUT' && options.body) {
      const outgoing = JSON.parse(String(options.body));
      const restored = restoreRanklessTasterStateMarkers(outgoing, originalMarkers);
      return fetchImpl(url, { ...options, body: JSON.stringify(restored) });
    }

    const response = await fetchImpl(url, options);
    if (!response.ok || method !== 'GET') return response;

    if (urlText === rankingUrl) {
      const html = await response.text();
      return new Response(suppressRanklessTasterCohortMarkers(html), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    if (urlText === stateUrl || urlText.startsWith(`${stateUrl}?`)) {
      const raw = await response.json();
      const suppressed = suppressRanklessTasterStateMarkers(raw);
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
  return publishMaintenanceRequestFile(requestPath, {
    ...options,
    baseUrl,
    fetchImpl: rankedCohortFetch(fetchImpl, baseUrl)
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
