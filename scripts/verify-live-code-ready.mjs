#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const ASSET_VERSION = '20260914-v8';

async function fetchText(fetchImpl, url, label) {
  const response = await fetchImpl(url, { method: 'GET', cache: 'no-store' });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.text();
}

async function fetchJson(fetchImpl, url, label) {
  const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.json();
}

export async function verifyLiveCodeReady(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

  const [html, runtime, renderer, editor, structure, state] = await Promise.all([
    fetchText(fetchImpl, `${baseUrl}/?verify=runtime-v7`, 'Catalogue HTML'),
    fetchText(fetchImpl, `${baseUrl}/catalogue-runtime.mjs?v=${ASSET_VERSION}`, 'Catalogue runtime'),
    fetchText(fetchImpl, `${baseUrl}/catalogue-recommendation-subsections.mjs?verify=v7-regressions`, 'Recommendation renderer'),
    fetchText(fetchImpl, `${baseUrl}/catalogue-structure-editor.mjs?verify=v4`, 'Structure editor'),
    fetchText(fetchImpl, `${baseUrl}/catalogue-structure.mjs?verify=v4`, 'Structure engine'),
    fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=v7-code`, 'Catalogue state')
  ]);

  if (!html.includes(`/catalogue-runtime.mjs?v=${ASSET_VERSION}`)) {
    throw new Error('Live catalogue HTML is missing the v8 runtime bootstrap.');
  }
  for (const moduleName of [
    'catalogue-convenience.mjs',
    'catalogue-recommendation-subsections.mjs',
    'catalogue-structure-editor.mjs'
  ]) {
    if (!runtime.includes(`./${moduleName}?v=${ASSET_VERSION}`)) {
      throw new Error(`Live catalogue runtime is missing the v8 ${moduleName} import.`);
    }
  }

  if (!renderer.includes('recommendationSubsections')) throw new Error('Live Recommendation renderer is not the v4 renderer.');
  if (!renderer.includes('data-recommendation-subsection') || !renderer.includes('recommendation-subsection-grid')) {
    throw new Error('Live Recommendation renderer is missing dedicated subsection containers.');
  }
  if (!renderer.includes("section-head recommendation-subsection-head") || !renderer.includes("createElement('h2')")) {
    throw new Error('Live Recommendation subsection headings are not using the established section typography.');
  }
  if (renderer.includes('recommendation-subsection-head h3') || renderer.includes("font-family:Georgia")) {
    throw new Error('Live Recommendation renderer still contains the obsolete custom subsection typography.');
  }
  if (!renderer.includes('recommendation-v4-rank-cleanup') || !renderer.includes('stripLegacyRecommendationRanks')) {
    throw new Error('Live Recommendation renderer is missing the v4 rank cleanup needed for subsection reordering.');
  }
  if (!renderer.includes('scrollRestoration') || !renderer.includes('scrollTo(0, 0)')) {
    throw new Error('Live Recommendation renderer is missing the initial top-of-page scroll reset.');
  }
  if (!editor.includes('catalogue-admin-recommendation-subsection')) throw new Error('Live editor is missing the Recommendation subsection selector.');
  if (!editor.includes('catalogue-admin-subsection-manager')) throw new Error('Live editor is missing subsection management controls.');
  if (!structure.includes('CATALOGUE_STATE_VERSION = 4')) throw new Error('Live structure engine is not v4.');
  if (![3, 4].includes(Number(state?.version))) throw new Error(`Unexpected live catalogue state version ${state?.version}.`);

  return { ok: true, stateVersion: Number(state.version) };
}

async function main() {
  const result = await verifyLiveCodeReady();
  console.log(`Live v7 subsection fixes verified; catalogue state version is ${result.stateVersion}.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main().catch(error => {
    console.error(`Live code readiness verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
