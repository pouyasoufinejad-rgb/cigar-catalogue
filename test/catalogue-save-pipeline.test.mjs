import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createCatalogueStatePipeline } from '../public/catalogue-save-pipeline.mjs';

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type':'application/json' }
  });
}

test('catalogue save transforms run deterministically by priority, then name', async () => {
  const pipeline = createCatalogueStatePipeline();
  const calls = [];
  pipeline.registerTransform('z-last-at-same-priority', 20, payload => {
    calls.push('z');
    return { ...payload, order:[...(payload.order || []), 'z'] };
  });
  pipeline.registerTransform('first', 10, payload => {
    calls.push('first');
    return { ...payload, order:[...(payload.order || []), 'first'] };
  });
  pipeline.registerTransform('a-first-at-same-priority', 20, payload => {
    calls.push('a');
    return { ...payload, order:[...(payload.order || []), 'a'] };
  });

  assert.deepEqual(await pipeline.applyTransforms({ version:3 }), {
    version:3,
    order:['first', 'a', 'z']
  });
  assert.deepEqual(calls, ['first', 'a', 'z']);
});

test('registration by name replaces the previous transform instead of stacking it', async () => {
  const pipeline = createCatalogueStatePipeline();
  pipeline.registerTransform('feature', 20, payload => ({ ...payload, result:'old' }));
  pipeline.registerTransform('feature', 5, payload => ({ ...payload, result:'new' }));
  assert.deepEqual(await pipeline.applyTransforms({}), { result:'new' });
});

test('non-catalogue requests pass through untouched', async () => {
  const pipeline = createCatalogueStatePipeline();
  const seen = [];
  const target = {
    fetch: async (input, init) => {
      seen.push({ input, init });
      return responseJson({ ok:true });
    }
  };
  pipeline.install(target);

  const init = { method:'PUT', body:'raw body' };
  const response = await target.fetch('/api/other', init);
  assert.equal(response.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].input, '/api/other');
  assert.equal(seen[0].init, init);
});

test('catalogue PUT is parsed once, transformed, serialized once, and notifies listeners with final state', async () => {
  const pipeline = createCatalogueStatePipeline();
  const seen = [];
  const events = [];
  pipeline.registerTransform('one', 10, payload => ({ ...payload, cards:{ ...(payload.cards || {}), one:{ rank:1 } } }));
  pipeline.registerTransform('two', 20, payload => ({ ...payload, sections:{ ok:true } }));
  pipeline.registerResponseListener('test', event => events.push(event));
  const target = {
    fetch: async (input, init) => {
      seen.push({ input, init });
      return responseJson({ ok:true });
    }
  };
  pipeline.install(target);

  const response = await target.fetch('/api/catalogue-overrides', {
    method:'PUT',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ version:3, cards:{} })
  });
  assert.equal(response.ok, true);
  assert.equal(seen.length, 1);
  const sent = JSON.parse(seen[0].init.body);
  assert.deepEqual(sent.cards.one, { rank:1 });
  assert.deepEqual(sent.sections, { ok:true });
  assert.equal(events.length, 1);
  assert.equal(events[0].method, 'PUT');
  assert.deepEqual(events[0].state, sent);
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

test('only the shared save pipeline owns catalogue-state fetch wrapping', async () => {
  const pipelineSource = await readFile(new URL('../public/catalogue-save-pipeline.mjs', import.meta.url), 'utf8');
  const flavourSource = await readFile(new URL('../public/catalogue-flavour.mjs', import.meta.url), 'utf8');
  const halfSource = await readFile(new URL('../public/catalogue-half-cohort.mjs', import.meta.url), 'utf8');

  assert.match(pipelineSource, /target\.fetch\s*=\s*wrappedFetch/);
  assert.doesNotMatch(flavourSource, /globalThis\.fetch\s*=|window\.fetch\s*=/);
  assert.doesNotMatch(halfSource, /globalThis\.fetch\s*=|window\.fetch\s*=/);
  assert.match(flavourSource, /registerCatalogueStateTransform/);
  assert.match(halfSource, /registerCatalogueStateTransform/);
});
