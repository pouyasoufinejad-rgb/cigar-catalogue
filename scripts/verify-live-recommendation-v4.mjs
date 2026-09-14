#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';
import {
  validateRecommendationSubsectionsShape,
  recommendationLocation,
  assertRecommendationInventory,
  normaliseCatalogueType
} from '../public/catalogue-structure.mjs';
import {
  parseCatalogueRows,
  mergeStateIntoRows
} from './build-recommendation-subsections-migration.mjs';
import { verifyLiveCodeReady } from './verify-live-code-ready.mjs';

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

function assertContiguous(rows, type) {
  const ranks = rows
    .filter(row => !row.archived && normaliseCatalogueType(row.catalogueType, Boolean(row.taster)) === type)
    .map(row => Number(row.rank))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  for (let index = 0; index < ranks.length; index += 1) {
    if (ranks[index] !== index + 1) throw new Error(`${type} ranks are not contiguous at ${index + 1}.`);
  }
}

export async function verifyLiveRecommendationV4(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

  const code = await verifyLiveCodeReady({ fetchImpl, baseUrl });
  if (code.stateVersion !== 4) throw new Error(`Live catalogue state is v${code.stateVersion}, expected v4.`);

  const [state, html] = await Promise.all([
    fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=final-v4`, 'Catalogue state'),
    fetchText(fetchImpl, `${baseUrl}/?catalogue_verify=final-v4`, 'Catalogue HTML')
  ]);
  if (Number(state?.version) !== 4) throw new Error(`Live catalogue state is v${state?.version}, expected v4.`);
  const subsections = validateRecommendationSubsectionsShape(state.recommendationSubsections);
  const rows = mergeStateIntoRows(parseCatalogueRows(html), state);
  const activeRecommendationKeys = rows
    .filter(row => !row.archived && normaliseCatalogueType(row.catalogueType, Boolean(row.taster)) === 'main')
    .map(row => row.key);
  const forbiddenKeys = rows
    .filter(row => row.archived || normaliseCatalogueType(row.catalogueType, Boolean(row.taster)) !== 'main')
    .map(row => row.key);
  assertRecommendationInventory({ subsections, activeRecommendationKeys, forbiddenKeys });

  const joya = recommendationLocation(subsections, 'joya-black');
  if (!joya || joya.subsectionId === 'flavoured') throw new Error('Joya Black is incorrectly placed in Flavoured.');
  const kfc = recommendationLocation(subsections, 'kfc-ponies-sweets');
  if (kfc?.subsectionId === 'flavoured') throw new Error('KFC Sweet Ponies is incorrectly placed in Flavoured.');

  assertContiguous(rows, 'half');
  assertContiguous(rows, 'taster');

  return {
    ok: true,
    subsectionCount: subsections.length,
    recommendationCount: subsections.reduce((sum, section) => sum + section.entryKeys.length, 0),
    joyaSubsection: joya?.subsectionId || ''
  };
}

async function main() {
  const result = await verifyLiveRecommendationV4();
  console.log(`Live v4 catalogue verified: ${result.recommendationCount} Recommendation entries across ${result.subsectionCount} subsections; Joya Black is in ${result.joyaSubsection}.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main().catch(error => {
    console.error(`Live v4 verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
