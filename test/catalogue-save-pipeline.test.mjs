import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createCatalogueStatePipeline
} from '../public/catalogue-save-pipeline.mjs';

function responseJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('shared pipeline applies transforms in priority order', async () => {
  const pipeline = createCatalogueStatePipeline();
  pipeline.registerTransform('later', 30, payload => ({ ...payload, order: [...(payload.order || []), 'later'] }));
  pipeline.registerTransform('first', 10, payload => ({ ...payload, order: [...(payload.order || []), 'first'] }));
  pipeline.registerTransform('middle', 20, payload => ({ ...payload, order: [...(payload.order || []), 'middle'] }));

  assert.deepEqual(await pipeline.applyTransforms({ order: [] }), {
    order: ['first', 'middle', 'later']
  });
});

test('registering the same transform name replaces rather than duplicates ownership', async () => {
  const pipeline = createCatalogueStatePipeline();
  pipeline.registerTransform('owner', 10, payload => ({ ...payload, value: 'old' }));
  pipeline.registerTransform('owner', 10, payload => ({ ...payload, value: 'new' }));
  assert.deepEqual(await pipeline.applyTransforms({}), { value: 'new' });
});

test('pipeline wraps catalogue state PUT and leaves other fetches untouched', async () => {
  const calls = [];
  const target = {
    location: { href:'https://catalogue.test/' },
    fetch: async (input, init = {}) => {
      calls.push({ input, init });
      return responseJson({ ok:true });
    }
  };
  const pipeline = createCatalogueStatePipeline();
  pipeline.registerTransform('patch', 10, payload => ({ ...payload, patched:true }));
  pipeline.install(target);

  await target.fetch('/api/catalogue-overrides', {
    method:'PUT',
    body:JSON.stringify({ version:3 })
  });
  await target.fetch('/other', { method:'PUT', body:'plain' });

  assert.equal(JSON.parse(calls[0].init.body).patched, true);
  assert.equal(calls[1].init.body, 'plain');
});

test('successful catalogue PUT notifies listeners with the final transformed state', async () => {
  const events = [];
  const target = {
    location: { href:'https://catalogue.test/' },
    fetch: async () => responseJson({ ok:true })
  };
  const pipeline = createCatalogueStatePipeline();
  pipeline.registerTransform('patch', 10, payload => ({ ...payload, patched:true }));
  pipeline.registerResponseListener('observer', event => events.push(event));
  pipeline.install(target);

  await target.fetch('/api/catalogue-overrides', {
    method:'PUT',
    body:JSON.stringify({ version:3 })
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].method, 'PUT');
  assert.deepEqual(events[0].state, { version:3, patched:true });
});

test('failed catalogue PUT does not notify listeners', async () => {
  const events = [];
  const target = {
    location: { href:'https://catalogue.test/' },
    fetch: async () => responseJson({ error:'no' }, 400)
  };
  const pipeline = createCatalogueStatePipeline();
  pipeline.registerResponseListener('observer', event => events.push(event));
  pipeline.install(target);
  await target.fetch('/api/catalogue-overrides', { method:'PUT', body:'{}' });
  assert.deepEqual(events, []);
});

test('successful catalogue GET notifies listeners from a clone without consuming the caller response', async () => {
  const pipeline = createCatalogueStatePipeline();
  const events = [];
  pipeline.registerResponseListener('test', event => events.push(event));
  const target = { fetch: async () => responseJson({ version:3, cards:{ one:{ rank:1 } } }) };
  pipeline.install(target);

  const response = await target.fetch('/api/catalogue-overrides', { method:'GET' });
  const callerPayload = await response.json();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(callerPayload.cards.one.rank, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].method, 'GET');
  assert.equal(events[0].state.cards.one.rank, 1);
});

test('only the shared save pipeline wraps fetch and v4 structure owns placement before targeted rank cleanup', async () => {
  const pipelineSource = await readFile(new URL('../public/catalogue-save-pipeline.mjs', import.meta.url), 'utf8');
  const flavourSource = await readFile(new URL('../public/catalogue-flavour.mjs', import.meta.url), 'utf8');
  const halfSource = await readFile(new URL('../public/catalogue-half-cohort.mjs', import.meta.url), 'utf8');
  const structureSource = await readFile(new URL('../public/catalogue-structure-editor.mjs', import.meta.url), 'utf8');
  const recommendationSource = await readFile(new URL('../public/catalogue-recommendation-subsections.mjs', import.meta.url), 'utf8');

  assert.match(pipelineSource, /target\.fetch\s*=\s*wrappedFetch/);
  assert.doesNotMatch(flavourSource, /globalThis\.fetch\s*=|window\.fetch\s*=/);
  assert.doesNotMatch(halfSource, /globalThis\.fetch\s*=|window\.fetch\s*=/);
  assert.doesNotMatch(structureSource, /globalThis\.fetch\s*=|window\.fetch\s*=/);

  assert.match(flavourSource, /registerCatalogueStateTransform/);
  assert.doesNotMatch(halfSource, /registerCatalogueStateTransform/);
  assert.match(structureSource, /registerCatalogueStateTransform\(STRUCTURE_TRANSFORM,\s*90/);
  assert.match(structureSource, /const STRUCTURE_TRANSFORM = ['"]catalogue-v4-structure['"]/);
  assert.match(recommendationSource, /registerCatalogueStateTransform\(RANK_CLEANUP_TRANSFORM,\s*95/);
  assert.match(recommendationSource, /const RANK_CLEANUP_TRANSFORM = ['"]recommendation-v4-rank-cleanup['"]/);
});
