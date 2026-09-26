import test from 'node:test';
import assert from 'node:assert/strict';

import { publishRequestDocument } from '../scripts/publish-catalogue-request.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const TOKEN = 'test-token-do-not-log';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function router(routes) {
  return async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const href = String(url);
    const route = routes.find(item => item.method === method && item.url === href);
    if (!route) throw new Error(`Unexpected request: ${method} ${href}`);
    return typeof route.response === 'function' ? route.response({ options }) : route.response;
  };
}

const FULL_BLEND = [
  { id: 'natural', label: 'Natural' },
  {
    id: 'maduro',
    label: 'Maduro',
    title: 'Cubanitos Maduro',
    packagePrice: 129,
    packageCount: 10,
    packageLabel: 'tin of 10',
    price: 12.9,
    strength: 7,
    quality: 8,
    productionLines: ['Wrapper: Connecticut Broadleaf'],
    retailerLinks: ['https://example.com/maduro']
  }
];

const PROFILE_PATCH = [
  { id: 'natural', label: 'Natural', flavourProfile: { sweet: 2, cedar: 3 } },
  { id: 'maduro', label: 'Maduro', flavourProfile: { sweet: 4, pepper: 3 } }
];

test('a partial blend profile patch preserves complete static variant data', async () => {
  const state = {
    version: 3,
    cards: {
      cubanitos: {
        rank: 1,
        archived: false,
        taster: false,
        blendVariants: structuredClone(FULL_BLEND),
        defaultBlendVariantId: 'natural'
      }
    },
    sections: {},
    entries: {}
  };
  let writtenState;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse(writtenState) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=cubanitos`, response: new Response('<article data-key="cubanitos"></article>', { status: 200 }) }
  ];

  await publishRequestDocument({
    operation: 'upsert-entry',
    key: 'cubanitos',
    entry: { blendVariants: PROFILE_PATCH }
  }, { fetchImpl: router(routes), baseUrl: BASE, token: TOKEN });

  const maduro = writtenState.cards.cubanitos.blendVariants.find(item => item.id === 'maduro');
  assert.equal(maduro.title, 'Cubanitos Maduro');
  assert.equal(maduro.price, 12.9);
  assert.deepEqual(maduro.productionLines, ['Wrapper: Connecticut Broadleaf']);
  assert.deepEqual(maduro.retailerLinks, ['https://example.com/maduro']);
  assert.deepEqual(maduro.flavourProfile, { sweet: 4, pepper: 3 });
});

test('a partial blend profile patch preserves complete dynamic variant data', async () => {
  const entry = {
    key: 'dynamic-cigar',
    brand: 'Brand',
    title: 'Base',
    rank: 1,
    archived: false,
    taster: false,
    blendVariants: structuredClone(FULL_BLEND),
    defaultBlendVariantId: 'natural'
  };
  const state = {
    version: 3,
    cards: {
      'dynamic-cigar': {
        rank: 1,
        archived: false,
        taster: false,
        blendVariants: structuredClone(FULL_BLEND),
        defaultBlendVariantId: 'natural'
      }
    },
    sections: {},
    entries: { 'dynamic-cigar': entry }
  };
  let writtenState;
  let writtenEntry;
  const routes = [
    { method: 'GET', url: `${BASE}/api/catalogue-overrides`, response: jsonResponse(state) },
    { method: 'PUT', url: `${BASE}/api/catalogue-entry/dynamic-cigar`, response: ({ options }) => {
      writtenEntry = JSON.parse(options.body);
      return jsonResponse({ ok: true, entry: writtenEntry });
    } },
    { method: 'PUT', url: `${BASE}/api/catalogue-overrides`, response: ({ options }) => {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok: true });
    } },
    { method: 'GET', url: `${BASE}/api/catalogue-entry/dynamic-cigar`, response: () => jsonResponse(writtenEntry) },
    { method: 'GET', url: `${BASE}/api/catalogue-overrides?verify=1`, response: () => jsonResponse({ ...writtenState, entries: { 'dynamic-cigar': writtenEntry } }) },
    { method: 'GET', url: `${BASE}/?catalogue_verify=dynamic-cigar`, response: new Response('<article data-key="dynamic-cigar"></article>', { status: 200 }) }
  ];

  await publishRequestDocument({
    operation: 'upsert-entry',
    key: 'dynamic-cigar',
    entry: { blendVariants: PROFILE_PATCH }
  }, { fetchImpl: router(routes), baseUrl: BASE, token: TOKEN });

  const maduro = writtenEntry.blendVariants.find(item => item.id === 'maduro');
  assert.equal(maduro.title, 'Cubanitos Maduro');
  assert.equal(maduro.price, 12.9);
  assert.deepEqual(maduro.productionLines, ['Wrapper: Connecticut Broadleaf']);
  assert.deepEqual(maduro.retailerLinks, ['https://example.com/maduro']);
  assert.deepEqual(maduro.flavourProfile, { sweet: 4, pepper: 3 });
};
