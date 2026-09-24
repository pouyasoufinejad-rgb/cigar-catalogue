import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';

const SHELL = '<!doctype html><html><head><title>Catalogue</title></head>'
  + '<body><main><article class="card" data-key="baked"><h3>Baked</h3></article></main></body></html>';

function env({ failReads = false, state = { version: 3, cards: {}, entries: {}, sections: {} } } = {}) {
  return {
    CATALOGUE_STATE: {
      async get() {
        if (failReads) throw new Error('KV unavailable');
        return JSON.stringify(state);
      },
      async put() {}
    },
    ASSETS: {
      async fetch() {
        return new Response(SHELL, {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            etag: '"static-asset-etag"',
            'last-modified': 'Wed, 20 Aug 2026 00:00:00 GMT'
          }
        });
      }
    }
  };
}

const get = (environment) =>
  worker.fetch(new Request('https://cigar-catalogue.psncodex.workers.dev/'), environment);

test('the page carries its runtime bootstrap', async () => {
  const response = await get(env());
  const html = await response.text();
  assert.match(html, /<script type="module" src="\/catalogue-runtime\.mjs\?v=\d+"><\/script>/);
});

test('a KV failure still ships the bootstrap instead of the bare static shell', async () => {
  const response = await get(env({ failReads: true }));
  assert.equal(response.status, 200);
  const html = await response.text();
  // Without this the browser loads no modules at all and the visitor sees the markup baked
  // into the static file, which is the whole catalogue out of date.
  assert.match(html, /<script type="module" src="\/catalogue-runtime\.mjs\?v=\d+"><\/script>/,
    'the runtime must survive a state read failure');
  assert.equal(response.headers.get('x-cigar-catalogue-degraded'), '1',
    'and the response should say it is serving without state');
});

test('a validator copied from the static asset is dropped, since the body is rewritten', async () => {
  const response = await get(env());
  // The asset ships an ETag for the untransformed file. Keeping it lets a revalidation
  // answer 304 and serve the previous body, which is how a stale page comes back.
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('last-modified'), null);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
});

test('a healthy read is not marked degraded', async () => {
  const response = await get(env());
  assert.equal(response.headers.get('x-cigar-catalogue-degraded'), null);
});
