import test from 'node:test';
import assert from 'node:assert/strict';
import { handleImage, imageCacheControl, renderEntryCard, applyStructuralOverridesToHtml } from '../src/index.js';

test('dynamic and replacement artwork defers off-screen loading without changing image URLs', () => {
  const imageUrl = '/api/catalogue-image/example?v=123';
  for (const fields of [{ imageUrl }, { imageSourceKey: 'original' }]) {
    const html = renderEntryCard({ key: 'example', brand: 'Example', title: 'Cigar', ...fields });
    const image = html.match(/<img\b[^>]*>/)?.[0];
    assert.match(image, /loading="lazy"/);
    assert.match(image, /decoding="async"/);
    if (fields.imageUrl) assert.ok(image.includes(imageUrl));
  }
  const html = applyStructuralOverridesToHtml('<article class="card" data-key="example"><div class="artframe"></div></article>', { example: { imageUrl } });
  assert.match(html, /<img[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.ok(html.includes(imageUrl));
});

test('image delivery starts both KV reads together and streams original bytes', async () => {
  const calls = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const bytes = new Uint8Array([0, 255, 42, 17]);
  const env = { CATALOGUE_STATE: { get(key, type) {
    calls.push([key, type]);
    return key.startsWith('catalogue-image-meta:') ? Promise.resolve('image/webp') : pending;
  } } };
  const responsePromise = handleImage(new Request('https://catalogue.test/api/catalogue-image/example'), env, 'example');
  release(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }));
  assert.deepEqual(calls, [['catalogue-image:example', 'stream'], ['catalogue-image-meta:example', undefined]]);
  const response = await responsePromise;
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300, must-revalidate');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('HEAD cancels unused image streams and missing images remain 404', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const env = { CATALOGUE_STATE: { async get(key) { return key.startsWith('catalogue-image-meta:') ? 'image/png' : stream; } } };
  const response = await handleImage(new Request('https://catalogue.test/api/catalogue-image/example', { method: 'HEAD' }), env, 'example');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.equal(cancelled, true);
  const missing = await handleImage(new Request('https://catalogue.test/api/catalogue-image/missing'), { CATALOGUE_STATE: { async get() { return null; } } }, 'missing');
  assert.equal(missing.status, 404);
});


test('versioned KV artwork is immutable and served from the edge cache without changing bytes', async () => {
  const store = new Map();
  const cache = {
    async match(request) {
      const cached = store.get(request.url);
      return cached ? cached.clone() : undefined;
    },
    async put(request, response) {
      store.set(request.url, response.clone());
    }
  };
  const waits = [];
  const options = { cache, waitUntil: promise => waits.push(promise) };
  const bytes = new Uint8Array([9, 8, 7, 6, 5]);
  let reads = 0;
  const env = { CATALOGUE_STATE: { get(key, type) {
    reads += 1;
    if (key.startsWith('catalogue-image-meta:')) return Promise.resolve('image/png');
    return Promise.resolve(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }));
  } } };
  const request = new Request('https://catalogue.test/api/catalogue-image/example?v=1700000000000');
  const first = await handleImage(request, env, 'example', options);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), bytes);
  await Promise.all(waits);
  assert.equal(reads, 2);

  const cached = await handleImage(request, {
    CATALOGUE_STATE: { get() { throw new Error('KV should not be touched on a cache hit'); } }
  }, 'example', options);
  assert.deepEqual(new Uint8Array(await cached.arrayBuffer()), bytes);
  assert.equal(reads, 2);
});

test('only versioned image URLs receive immutable caching', () => {
  assert.equal(
    imageCacheControl(new Request('https://catalogue.test/api/catalogue-image/example?v=123')),
    'public, max-age=31536000, immutable'
  );
  assert.equal(
    imageCacheControl(new Request('https://catalogue.test/api/catalogue-image/example')),
    'public, max-age=300, must-revalidate'
  );
});
