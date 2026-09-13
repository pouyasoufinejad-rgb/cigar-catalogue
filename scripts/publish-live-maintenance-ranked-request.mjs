#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_BASE_URL,
  publishMaintenanceRequestFile
} from './publish-live-maintenance-request.mjs';

function attributeValue(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '';
}

function positiveRankFromTag(tag) {
  const value = Number(attributeValue(tag, 'data-rank'));
  return Number.isFinite(value) && value >= 1 ? Math.round(value) : null;
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

function rankedCohortFetch(fetchImpl, baseUrl) {
  const rankingUrl = `${String(baseUrl).replace(/\/$/, '')}/?catalogue_source=maintenance`;
  return async (url, options = {}) => {
    const response = await fetchImpl(url, options);
    if (String(url) !== rankingUrl || !response.ok || String(options.method || 'GET').toUpperCase() !== 'GET') return response;
    const html = await response.text();
    return new Response(suppressRanklessTasterCohortMarkers(html), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
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
