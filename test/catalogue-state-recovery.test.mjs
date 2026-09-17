import test from 'node:test';
import assert from 'node:assert/strict';

import { recoverImageReferences, validateRecoveryManifest } from '../scripts/recover-image-references.mjs';

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
    const route = routes.find(item => item.method === method && (typeof item.url === 'function' ? item.url(href) : item.url === href));
    if (!route) throw new Error(`Unexpected request: ${method} ${href}`);
    return typeof route.response === 'function' ? route.response({ url:href, method, options }) : route.response;
  };
}

test('recovery manifest supports archive reconstruction without requiring image references', () => {
  const manifest = validateRecoveryManifest({
    id:'archive-recovery',
    archivedEntries:{
      'oliva-serie-o': { archivedRank:22 },
      'montecristo-short': {}
    }
  });
  assert.deepEqual(manifest.archivedEntries, {
    'oliva-serie-o': { archivedRank:22 },
    'montecristo-short': {}
  });
  assert.deepEqual(manifest.imageReferences, {});
});

test('archive reconstruction restores archived state, removes active rank and subsection membership, and preserves unrelated data', async () => {
  const calls = [];
  const state = {
    version:3,
    entries:{
      'oliva-serie-o': { key:'oliva-serie-o', brand:'Oliva', title:'Serie O', rank:16, futureEntryField:{keep:true} },
      other:{ key:'other', brand:'Other', title:'Other', rank:2 }
    },
    cards:{
      'oliva-serie-o': { rank:16, quality:8, futureCardField:{keep:true} },
      other:{ rank:2, quality:7 }
    },
    sections:{
      recommendationSubsections:[
        { id:'coronets-cigarillos', title:'Coronets', note:'', entryKeys:['oliva-serie-o','other'] }
      ],
      futureSectionField:{keep:true}
    }
  };
  let written;
  const finalHtml = '<article class="card" data-key="oliva-serie-o" data-archived="1" data-archived-rank="22"></article><article class="card" data-key="other"></article>';
  const routes = [
    { method:'GET', url:`${BASE}/api/catalogue-overrides`, response:jsonResponse(state) },
    { method:'PUT', url:`${BASE}/api/catalogue-overrides`, response:({options}) => { written = JSON.parse(options.body); return jsonResponse({ok:true}); } },
    { method:'GET', url:`${BASE}/api/catalogue-overrides?verify=image-recovery`, response:() => jsonResponse({ ...state, ...written, entries:state.entries }) },
    { method:'GET', url:href => href.startsWith(`${BASE}/?catalogue_image_recovery=`), response:new Response(finalHtml, {status:200, headers:{'content-type':'text/html'}}) }
  ];

  const result = await recoverImageReferences({
    id:'archive-recovery',
    archivedEntries:{ 'oliva-serie-o':{ archivedRank:22 } }
  }, { fetchImpl:createFetchRouter(routes, calls), baseUrl:BASE, token:TOKEN, sleep:async()=>{} });

  assert.equal(result.archived, 1);
  assert.equal(written.cards['oliva-serie-o'].archived, true);
  assert.equal(written.cards['oliva-serie-o'].archivedRank, 22);
  assert.equal('rank' in written.cards['oliva-serie-o'], false);
  assert.equal(written.cards['oliva-serie-o'].quality, 8);
  assert.deepEqual(written.cards['oliva-serie-o'].futureCardField, {keep:true});
  assert.deepEqual(written.cards.other, state.cards.other);
  assert.deepEqual(written.sections.futureSectionField, {keep:true});
  assert.deepEqual(written.sections.recommendationSubsections[0].entryKeys, ['other']);
  assert.equal('entries' in written, false);
});

test('latest-image reconstruction discovers catalogue keys from live HTML and uses every existing KV blob while leaving 404s untouched', async () => {
  const calls = [];
  const state = {
    version:3,
    entries:{ dynamic:{ key:'dynamic', brand:'Brand', title:'Dynamic', imageUrl:'/old-dynamic.png' } },
    cards:{ static:{ imageUrl:'/old-static.png', quality:7 } },
    sections:{}
  };
  const sourceHtml = '<article class="card" data-key="static"><img src="/old-static.png"></article><article class="card" data-key="dynamic"><img src="/old-dynamic.png"></article><article class="card" data-key="no-blob"><img src="/old-no-blob.png"></article>';
  let written;
  const expectedStatic = '/api/catalogue-image/static?v=recovery-20260917-latest';
  const expectedDynamic = '/api/catalogue-image/dynamic?v=recovery-20260917-latest';
  const finalHtml = `<article class="card" data-key="static"><img src="${expectedStatic}"></article><article class="card" data-key="dynamic"><img src="${expectedDynamic}"></article><article class="card" data-key="no-blob"><img src="/old-no-blob.png"></article>`;
  const routes = [
    { method:'GET', url:`${BASE}/api/catalogue-overrides`, response:jsonResponse(state) },
    { method:'GET', url:href => href.startsWith(`${BASE}/?catalogue_recovery_source=`), response:new Response(sourceHtml, {status:200, headers:{'content-type':'text/html'}}) },
    { method:'HEAD', url:`${BASE}/api/catalogue-image/static`, response:new Response(null, {status:200, headers:{'content-type':'image/png'}}) },
    { method:'HEAD', url:`${BASE}/api/catalogue-image/dynamic`, response:new Response(null, {status:200, headers:{'content-type':'image/webp'}}) },
    { method:'HEAD', url:`${BASE}/api/catalogue-image/no-blob`, response:new Response(null, {status:404}) },
    { method:'PUT', url:`${BASE}/api/catalogue-overrides`, response:({options}) => { written = JSON.parse(options.body); return jsonResponse({ok:true}); } },
    { method:'GET', url:`${BASE}/api/catalogue-overrides?verify=image-recovery`, response:() => jsonResponse({ ...state, ...written, entries:state.entries }) },
    { method:'GET', url:href => href.startsWith(`${BASE}/?catalogue_image_recovery=`), response:new Response(finalHtml, {status:200, headers:{'content-type':'text/html'}}) }
  ];

  const result = await recoverImageReferences({
    id:'latest-images', restoreLatestImages:true, imageVersionTag:'recovery-20260917-latest'
  }, { fetchImpl:createFetchRouter(routes, calls), baseUrl:BASE, token:TOKEN, sleep:async()=>{} });

  assert.equal(result.recovered, 2);
  assert.equal(written.cards.static.imageUrl, expectedStatic);
  assert.equal(written.cards.dynamic.imageUrl, expectedDynamic);
  assert.equal(written.cards.static.quality, 7);
  assert.equal(written.cards['no-blob'], undefined);
  assert.equal('entries' in written, false);
});
