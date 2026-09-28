import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialCatalogueStateLoader } from '../public/catalogue-initial-state.mjs';

test('startup consumers share one request but receive independent state objects', async () => {
  const load = createInitialCatalogueStateLoader();
  let requests = 0;
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const fetchImpl = async (url, options) => {
    requests += 1;
    assert.equal(url, '/api/catalogue-overrides');
    assert.equal(options.cache, 'no-store');
    return response;
  };
  const first = load(fetchImpl);
  const second = load(fetchImpl);
  resolve(new Response(JSON.stringify({ cards: { cigar: { blendVariants: [{ id: 'natural' }] } } })));
  const [a, b] = await Promise.all([first, second]);
  a.cards.cigar.blendVariants[0].id = 'changed';
  assert.equal(b.cards.cigar.blendVariants[0].id, 'natural');
  const late = await load(() => { throw new Error('late startup consumer refetched'); });
  assert.equal(late.cards.cigar.blendVariants[0].id, 'natural');
  assert.equal(requests, 1);
});

test('failed startup requests can be retried without retaining a rejected promise', async () => {
  for (const failure of [
    () => { throw new Error('network failed'); },
    () => new Response('unavailable', { status: 503 }),
    () => new Response('invalid JSON')
  ]) {
    const load = createInitialCatalogueStateLoader();
    await assert.rejects(load(failure));
    assert.deepEqual(await load(() => new Response('{"cards":{}}')), { cards: {} });
  }
});

test('sharing startup state never intercepts subsequent fresh reads or writes', async () => {
  const load = createInitialCatalogueStateLoader();
  let current = { cards: { cigar: { defaultBlendVariantId: 'maduro' } } };
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'PUT') current = JSON.parse(options.body);
    return new Response(JSON.stringify(current));
  };
  await load(fetchImpl);
  await fetchImpl('/api/catalogue-overrides', { method: 'PUT', body: '{"cards":{"cigar":{"defaultBlendVariantId":"natural"}}}' });
  const fresh = await (await fetchImpl('/api/catalogue-overrides')).json();
  assert.equal(fresh.cards.cigar.defaultBlendVariantId, 'natural');
});
