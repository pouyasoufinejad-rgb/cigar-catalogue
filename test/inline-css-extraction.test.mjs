import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

import { collect, concatenate, cssFileName, rewritePage } from '../scripts/extract-inline-css.mjs';

const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const cssDir = new URL('../public/css/', import.meta.url);

test('the page carries no inline stylesheet blocks', () => {
  // 306KB of the document's 710KB was 27 <style> blocks, re-sent on every navigation
  // because the document is no-cache and its ETag is stripped at the edge.
  assert.equal((page.match(/<style[^>]*>/g) || []).length, 0);
  assert.ok(page.length < 500_000,
    `the document should stay under 500KB, it is ${(page.length / 1024).toFixed(0)}KB`);
});

test('exactly one stylesheet, named after its own contents, in the head', async () => {
  const links = [...page.matchAll(/<link rel="stylesheet" href="(\/css\/[^"]+)">/g)].map(m => m[1]);
  assert.equal(links.length, 1, 'one link, or the cascade depends on load order between them');

  const name = links[0].slice('/css/'.length);
  assert.deepEqual(await readdir(cssDir), [name], 'no stale stylesheets left behind to be served');

  const css = await readFile(new URL(name, cssDir), 'utf8');
  // Without the hash the immutable header would pin browsers to an old cascade forever.
  assert.equal(cssFileName(css), name, 'the name must be the hash of the file it points at');

  // In the head, so it blocks render exactly as the inline blocks it replaced did. Moving
  // it below the fold would show an unstyled page first.
  assert.ok(page.indexOf(links[0]) < page.indexOf('</head>'));
});

test('the stylesheet is served immutable, or the extraction buys nothing twice', async () => {
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /^\/css\/\*/m);
  const block = headers.slice(headers.indexOf('/css/*'));
  assert.match(block, /Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/);
});

test('extraction preserves order, which is what decides every cascade tie', () => {
  // These blocks override one another by document order and nothing else. Concatenating
  // them in any other sequence silently changes which rule wins.
  const html = '<head><style>a{color:red}</style><style id="later">a{color:blue}</style></head>';
  const blocks = collect(html);
  assert.equal(blocks.length, 2);
  const css = concatenate(blocks);
  assert.ok(css.indexOf('color:red') < css.indexOf('color:blue'), 'the later rule must stay later');
  // The id is kept as a comment so a rule can still be found by the block it came from.
  assert.match(css, /\/\* later \*\//);

  const out = rewritePage(html, 'catalogue-abc1234567.css');
  assert.equal((out.match(/<style/g) || []).length, 0, 'every block is removed');
  assert.equal((out.match(/<link rel="stylesheet"/g) || []).length, 1, 'replaced by exactly one link');
  assert.ok(out.indexOf('<link') < out.indexOf('</head>'));
});

test('a style block in the body is left alone', () => {
  // Moving one into the head would change when it applies relative to the markup it was
  // written next to, so the extractor only takes what is already in the head.
  const html = '<head><style>a{color:red}</style></head><body><style>b{color:blue}</style></body>';
  assert.deepEqual(collect(html).map(block => block.css.trim()), ['a{color:red}']);
});

test('the stylesheet still holds the rules the page depends on', async () => {
  const name = page.match(/<link rel="stylesheet" href="\/css\/([^"]+)">/)[1];
  const css = await readFile(new URL(name, cssDir), 'utf8');
  // A sample from across the file, so a truncated or half-written stylesheet cannot pass.
  for (const rule of [/\.artframe\{height:360px/, /\.card\{/, /\.country-flag\.flag-cuba\{/, /\.medals/]) {
    assert.match(css, rule, `${rule} went missing from the stylesheet`);
  }
  assert.ok(css.length > 250_000, `the stylesheet looks truncated at ${(css.length / 1024).toFixed(0)}KB`);
  assert.equal(createHash('sha256').update(css).digest('hex').slice(0, 10), name.slice('catalogue-'.length, -4));
});
