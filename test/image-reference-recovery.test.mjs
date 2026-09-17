import test from 'node:test';
import assert from 'node:assert/strict';

import { validateRequest, publishRequestDocument } from '../scripts/publish-catalogue-request.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const TOKEN = 'test-token-do-not-log';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers:{ 'content-type':'application/json' } });
}

function createFetchRouter(routes, calls) {
  return async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const href = String(url);
    calls.push({ href, method, headers:new Headers(options.headers || {}), body:options.body });
    const route = routes.find(item => item.method === method && item.url === href);
    if (!route) throw new Error(`Unexpected request: ${method} ${href}`);
    return typeof route.response === 'function' ? route.response({ url:href, method, options }) : route.response;
  };
}

test('restore-image-reference accepts only the exact catalogue image endpoint for its key', () => {
  const request = validateRequest({
    operation:'restore-image-reference',
    key:'liga-privada-h99-coronets',
    imageUrl:'/api/catalogue-image/liga-privada-h99-coronets?v=recovery-20260917'
  });
  assert.equal(request.imageUrl, '/api/catalogue-image/liga-privada-h99-coronets?v=recovery-20260917');

  assert.throws(() => validateRequest({
    operation:'restore-image-reference',
    key:'liga-privada-h99-coronets',
    imageUrl:'/api/catalogue-image/another-key?v=1'
  }), /imageUrl/i);

  assert.throws(() => validateRequest({
    operation:'restore-image-reference',
    key:'liga-privada-h99-coronets',
    imageUrl:'https://example.com/logo.png'
  }), /imageUrl/i);
});

test('restore-image-reference changes only the target card imageUrl and never rewrites entries or rankings', async () => {
  const calls = [];
  const state = {
    version:3,
    entries:{
      'recover-me': { key:'recover-me', brand:'Brand', title:'Recover Me', rank:8, imageUrl:'', futureEntryField:{ keep:true } }
    },
    sections:{ recommendationSubsections:[{ id:'one', title:'One', note:'', entryKeys:['recover-me','other'] }], futureSectionField:{ keep:true } },
    cards:{
      'recover-me': { rank:8, catalogueType:'main', flavour:9, futureCardField:{ keep:true } },
      other: { rank:3, catalogueType:'half', archived:true, archivedRank:4, imageUrl:'/api/catalogue-image/other?v=old' }
    }
  };
  const imageUrl = '/api/catalogue-image/recover-me?v=recovery-20260917';
  let writtenState;
  const routes = [
    { method:'GET', url:`${BASE}/api/catalogue-overrides`, response:jsonResponse(state) },
    { method:'HEAD', url:`${BASE}/api/catalogue-image/recover-me`, response:new Response(null, { status:200, headers:{ 'content-type':'image/png' } }) },
    { method:'PUT', url:`${BASE}/api/catalogue-overrides`, response:({ options }) => {
      writtenState = JSON.parse(options.body);
      return jsonResponse({ ok:true });
    } },
    { method:'GET', url:`${BASE}/api/catalogue-overrides?verify=1`, response:() => jsonResponse({ ...state, ...writtenState, entries:state.entries }) },
    { method:'GET', url:`${BASE}/?catalogue_verify=recover-me`, response:new Response(
      `<article class="card" data-key="recover-me"><div class="artframe"><img src="${imageUrl}"></div></article>`,
      { status:200, headers:{ 'content-type':'text/html' } }
    ) }
  ];

  const result = await publishRequestDocument({ operation:'restore-image-reference', key:'recover-me', imageUrl }, {
    fetchImpl:createFetchRouter(routes, calls), baseUrl:BASE, token:TOKEN, includeStaticCatalogue:false
  });

  assert.equal(result.operation, 'restore-image-reference');
  assert.equal(result.target, 'card-image-reference');
  assert.equal(writtenState.cards['recover-me'].imageUrl, imageUrl);
  assert.equal(writtenState.cards['recover-me'].rank, 8);
  assert.equal(writtenState.cards['recover-me'].flavour, 9);
  assert.deepEqual(writtenState.cards['recover-me'].futureCardField, { keep:true });
  assert.deepEqual(writtenState.cards.other, state.cards.other);
  assert.deepEqual(writtenState.sections, state.sections);
  assert.equal('entries' in writtenState, false, 'state write must not send entries');
  assert.equal(calls.some(call => call.href.includes('/api/catalogue-entry/')), false, 'must not touch entry endpoint');
});

test('restore-image-reference refuses to reconnect a missing KV image blob', async () => {
  const calls = [];
  const routes = [
    { method:'GET', url:`${BASE}/api/catalogue-overrides`, response:jsonResponse({ version:3, cards:{ missing:{ rank:1 } }, sections:{}, entries:{} }) },
    { method:'HEAD', url:`${BASE}/api/catalogue-image/missing`, response:new Response(null, { status:404 }) }
  ];

  await assert.rejects(() => publishRequestDocument({
    operation:'restore-image-reference', key:'missing', imageUrl:'/api/catalogue-image/missing?v=recovery-20260917'
  }, { fetchImpl:createFetchRouter(routes, calls), baseUrl:BASE, token:TOKEN, includeStaticCatalogue:false }), /image.*404/i);

  assert.equal(calls.some(call => call.method === 'PUT'), false);
});
