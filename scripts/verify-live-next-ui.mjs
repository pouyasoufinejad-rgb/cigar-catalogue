#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

async function fetchText(fetchImpl, url, label) {
  const response = await fetchImpl(url, { method:'GET', cache:'no-store' });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.text();
}

async function fetchJson(fetchImpl, url, label) {
  const response = await fetchImpl(url, { method:'GET', headers:{ accept:'application/json' }, cache:'no-store' });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.json();
}

export async function verifyLiveNextUi(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const nonce = options.nonce || Date.now();

  const [html, runtime, ui, convenience, state] = await Promise.all([
    fetchText(fetchImpl, `${baseUrl}/?verify=next-ui-${nonce}`, 'Catalogue HTML'),
    fetchText(fetchImpl, `${baseUrl}/catalogue-runtime.mjs?verify=next-ui-${nonce}`, 'Catalogue runtime'),
    fetchText(fetchImpl, `${baseUrl}/catalogue-next-ui.mjs?verify=next-ui-${nonce}`, 'Rebuilt catalogue UI'),
    fetchText(fetchImpl, `${baseUrl}/catalogue-next-convenience.mjs?verify=next-ui-${nonce}`, 'Rebuilt convenience layer'),
    fetchJson(fetchImpl, `${baseUrl}/api/catalogue-overrides?verify=next-ui-${nonce}`, 'Catalogue state')
  ]);

  if (!html.includes('catalogue-runtime.mjs')) throw new Error('Live catalogue HTML is missing the runtime bootstrap.');
  if ((html.match(/article class=["']card["']/g) || []).length < 10) throw new Error('Live catalogue HTML no longer contains the static catalogue seed inventory.');

  for (const marker of [
    "catalogue-next-ui.mjs?v=20260915-next1",
    "catalogue-next-convenience.mjs?v=20260915-next1"
  ]) if (!runtime.includes(marker)) throw new Error(`Live runtime is missing ${marker}.`);

  for (const marker of [
    'catalogue-next-root',
    'Edit Catalogue',
    'catalogue-next-brand-explorer',
    'catalogue-next-edit-bar',
    'findCatalogueMountAnchor',
    'Save Changes'
  ]) if (!ui.includes(marker)) throw new Error(`Live rebuilt UI is missing ${marker}.`);

  if (/document\.body\.(?:innerHTML\s*=|replaceChildren\s*\()/.test(ui)) {
    throw new Error('Live rebuilt UI contains a body-replacement path that could remove the retained top artwork.');
  }

  for (const marker of [
    'catalogue-next-compare-tray',
    'catalogue-next-compare-overlay',
    'catalogue-next-retailer-matrix',
    'Want to Try',
    'mutationChangesCatalogueCards'
  ]) if (!convenience.includes(marker)) throw new Error(`Live convenience layer is missing ${marker}.`);

  if (Number(state?.version) !== 4 || !Array.isArray(state?.recommendationSubsections)) {
    throw new Error(`Expected live v4 catalogue state, received version ${state?.version}.`);
  }
  const names = state.recommendationSubsections.map(section => String(section?.name || ''));
  for (const required of ['Coronets','Petit Panatelas','Infused / Flavoured']) {
    if (!names.includes(required)) throw new Error(`Live catalogue state is missing Recommendation subsection ${required}.`);
  }
  const coronets = state.recommendationSubsections.find(section => section?.id === 'coronets' || section?.name === 'Coronets');
  const flavoured = state.recommendationSubsections.find(section => section?.id === 'flavoured' || section?.name === 'Infused / Flavoured');
  if (!coronets?.entryKeys?.includes('joya-black-cigarillo')) throw new Error('Joya Black is not in live Coronets.');
  if (flavoured?.entryKeys?.includes('joya-black-cigarillo')) throw new Error('Joya Black is incorrectly present in live Infused / Flavoured.');

  return {
    ok:true,
    stateVersion:Number(state.version),
    recommendationSubsections:names,
    joyaSubsection:'coronets'
  };
}

async function main() {
  const result = await verifyLiveNextUi();
  console.log(`Rebuilt catalogue UI verified live; state v${result.stateVersion}; Joya Black is in ${result.joyaSubsection}.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main().catch(error => {
    console.error(`Rebuilt catalogue UI verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
