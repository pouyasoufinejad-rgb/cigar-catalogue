import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { weakEntityTag, matchesEntityTag } from '../src/index.js';

const SHELL = '<!doctype html><html><head><title>Catalogue</title></head>'
  + '<body><main><article class="card" data-key="baked"><h3>Baked</h3></article></main></body></html>';

function env({ failReads = false, shell = SHELL, state = { version: 3, cards: {}, entries: {}, sections: {} } } = {}) {
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
        return new Response(shell, {
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

test('the static asset validator is replaced by one describing the rewritten body', async () => {
  const response = await get(env());
  // The asset ships an ETag for the untransformed file. Keeping it lets a revalidation
  // answer 304 and serve the previous body, which is how a stale page comes back.
  const etag = response.headers.get('etag');
  assert.notEqual(etag, '"static-asset-etag"', 'the asset\'s own tag describes a different document');
  assert.match(etag || '', /^W\/"[0-9a-f]{32}"$/, 'the tag should come from this body');
  assert.equal(response.headers.get('last-modified'), null);
  // no-cache stores but always revalidates, so a reload cannot show an old catalogue while
  // an unchanged one still costs a 304 rather than several megabytes.
  assert.match(response.headers.get('cache-control') || '', /no-cache/);
});

test('an unchanged catalogue revalidates to 304 instead of resending the document', async () => {
  const first = await get(env());
  const etag = first.headers.get('etag');
  const again = await worker.fetch(
    new Request('https://cigar-catalogue.psncodex.workers.dev/', { headers: { 'if-none-match': etag } }),
    env());
  assert.equal(again.status, 304);
  assert.equal(again.headers.get('etag'), etag);
  assert.equal(await again.text(), '', 'a 304 carries no body');
});

test('the validator is a function of the body, so a changed catalogue cannot match', async () => {
  // This is what stops a tag outliving a catalogue change, which is the stale page itself.
  const before = await weakEntityTag('<html>one</html>');
  const after = await weakEntityTag('<html>two</html>');
  assert.match(before, /^W\/"[0-9a-f]{32}"$/);
  assert.notEqual(before, after, 'two documents must not share a tag');
  assert.equal(await weakEntityTag('<html>one</html>'), before, 'and the same one always does');
  assert.equal(matchesEntityTag(before, after), false);
  assert.equal(matchesEntityTag(before, before), true);
  // A browser may send several, and drops the weak marker in some of them.
  assert.equal(matchesEntityTag(`"deadbeef", ${before}`, before), true);
  assert.equal(matchesEntityTag(before.replace('W/', ''), before), true);
  assert.equal(matchesEntityTag('', before), false);
});

test('the served validator tracks the served document, not a constant', async () => {
  // A tag pinned to anything but this body would survive a catalogue change and hand a
  // reload the previous page, which is the failure this whole mechanism exists to stop.
  const one = await get(env());
  const two = await get(env({ shell: SHELL.replace('Baked', 'Renamed by an edit') }));
  assert.notEqual(one.headers.get('etag'), two.headers.get('etag'));
});

test('a stale or absent validator is not honoured', async () => {
  const stale = await worker.fetch(
    new Request('https://cigar-catalogue.psncodex.workers.dev/',
      { headers: { 'if-none-match': '"static-asset-etag"' } }),
    env());
  assert.equal(stale.status, 200, 'the asset\'s own tag must never satisfy a revalidation');
});

test('a healthy read is not marked degraded', async () => {
  const response = await get(env());
  assert.equal(response.headers.get('x-cigar-catalogue-degraded'), null);
});
