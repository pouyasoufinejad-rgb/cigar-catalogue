#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

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

  const [renderer, editor, structure, state] = await Promise.all([
    fetchText(fetchImpl, `${baseUrl}/catalogue-recommendation-subsections.mjs?verify=v4`, 'Recommendation renderer'),
    fetchText(fetchImpl, `${baseUrl}/catalogue-structure-editor.mjs?verify=v4`, 'Structure editor'),
    fetchText(fetchImpl, `${baseUrl}/catalogue-structure.mjs?verify=v4`, 'Structure engine'),
    fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=v4-code`, 'Catalogue state')
  ]);

  if (!renderer.includes('recommendationSubsections')) throw new Error('Live Recommendation renderer is not the v4 renderer.');
  if (!renderer.includes('catalogue-recommendation-subsection')) throw new Error('Live Recommendation renderer is missing dedicated subsection containers.');
  if (!editor.includes('catalogue-admin-recommendation-subsection')) throw new Error('Live editor is missing the Recommendation subsection selector.');
  if (!editor.includes('catalogue-admin-subsection-manager')) throw new Error('Live editor is missing subsection management controls.');
  if (!structure.includes('CATALOGUE_STATE_VERSION = 4')) throw new Error('Live structure engine is not v4.');
  if (![3, 4].includes(Number(state?.version))) throw new Error(`Unexpected live catalogue state version ${state?.version}.`);

  return { ok: true, stateVersion: Number(state.version) };
}

async function main() {
  const result = await verifyLiveCodeReady();
  console.log(`Live v4-compatible code verified; catalogue state version is ${result.stateVersion}.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main().catch(error => {
    console.error(`Live code readiness verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
