import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

import { rewritePage, fileNameFor } from '../scripts/extract-inline-artwork.mjs';

const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const artDir = new URL('../public/art/', import.meta.url);

test('no artwork has crept back into the document as base64', () => {
  // The page was 5.7MB, 94% of it base64 inside <img src>. Every byte of that was
  // re-downloaded on every visit, scrolled to or not, because a data URI cannot be lazy
  // loaded or cached apart from the document.
  const inlined = page.match(/<img\b[^>]*?\bsrc=["']data:image[^"']*["']/g) || [];
  assert.equal(inlined.length, 0,
    `${inlined.length} images are inlined again; run scripts/extract-inline-artwork.mjs`);
  assert.ok(page.length < 1_200_000,
    `the document should stay well under 1.2MB, it is ${(page.length / 1048576).toFixed(2)}MB`);
});

test('every artwork reference resolves to a file whose contents match its name', async () => {
  const srcs = [...page.matchAll(/<img\b[^>]*?\bsrc=["'](\/art\/[^"']+)["']/g)].map(m => m[1]);
  assert.ok(srcs.length > 40, `expected the catalogue artwork, found ${srcs.length}`);

  const onDisk = new Set(await readdir(artDir));
  for (const src of srcs) {
    const name = src.slice('/art/'.length);
    assert.ok(onDisk.has(name), `${src} has no file behind it`);
    // The hash in the name is what makes immutable caching safe. If the bytes and the name
    // ever disagree, a browser would keep serving the wrong picture forever.
    const bytes = await readFile(new URL(name, artDir));
    assert.ok(name.includes(createHash('sha256').update(bytes).digest('hex').slice(0, 10)),
      `${name} does not carry the hash of its own contents`);
  }

  const orphans = [...onDisk].filter(name => !srcs.some(src => src.endsWith(`/${name}`)));
  assert.deepEqual(orphans, [], 'files nothing references should not ship');
});

test('extracted artwork is lazy, which the fixed-height frame makes safe', () => {
  const tags = page.match(/<img\b[^>]*?\/art\/[^>]*?>/g) || [];
  assert.ok(tags.length > 40);
  for (const tag of tags) {
    assert.match(tag, /loading="lazy"/, `not lazy: ${tag.slice(0, 90)}`);
    assert.match(tag, /decoding="async"/);
  }
  // Without a frame that reserves its own height, a lazily-arriving image would shove the
  // page around as the reader scrolls.
  assert.match(page, /\.artframe\{height:360px/);
});

test('artwork is served immutable, or lifting it out buys nothing on a second visit', async () => {
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /^\/art\/\*/m);
  assert.match(headers, /Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/);
});

test('the rewrite is faithful and repeatable', () => {
  const bytes = Buffer.from('some artwork bytes');
  const base64 = bytes.toString('base64');
  const html = `<div class="artframe" data-key="liga-no9"><img alt="A cigar" src="data:image/webp;base64,${base64}"></div>`;
  const first = rewritePage(html);

  assert.equal(first.files.length, 1);
  assert.ok(first.files[0].bytes.equals(bytes), 'the file has to carry the original bytes');
  assert.match(first.html, /src="\/art\/liga-no9-[0-9a-f]{10}\.webp"/, 'named after its card, hashed for cache safety');
  assert.match(first.html, /alt="A cigar"/, 'other attributes survive');
  assert.match(first.html, /loading="lazy"/);

  // Running it again must not rename anything, or every run would invalidate every cache.
  assert.equal(rewritePage(html).html, first.html);
  assert.equal(fileNameFor(bytes, 'webp', 'liga-no9'), first.files[0].name);
  // And a page with nothing left to extract comes back untouched.
  assert.equal(rewritePage(first.html).html, first.html);
  assert.equal(rewritePage(first.html).files.length, 0);
});

test('an image the admin replaces still overrides a file-path source', async () => {
  // Static cards get their image swapped by a regex against src="...". It worked on base64
  // and has to keep working now the src is a path, or the editor silently stops taking.
  const worker = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const { applyStructuralOverridesToHtml } = await import('../src/index.js');
  void worker;
  const card = '<article class="card" data-key="x"><div class="artframe">'
    + '<img alt="a" src="/art/x-0123456789.webp"></div></article>';
  const out = applyStructuralOverridesToHtml(card, { x: { imageUrl: '/replacement.png' } });
  assert.match(out, /src="\/replacement\.png"/, 'the override must still land');
  assert.doesNotMatch(out, /\/art\/x-0123456789\.webp/);
});

test('the shell does not ship a stale catalogue for the runtime to correct', async () => {
  // The page was showing August's catalogue for 1.5s on a fast connection and 8.6s on slow
  // 4G, because that is literally what is baked into the file and 26 modules have to load
  // before it is rewritten. Whatever the shell says before the runtime lands has to be true.
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const refinements = await readFile(
    new URL('../public/catalogue-filter-refinements.mjs', import.meta.url), 'utf8');

  // The bands the runtime installs, taken from the module rather than repeated here.
  const bands = [...refinements.matchAll(/(\w+):\s*\{\s*label:\s*'([^']+)'/g)]
    .map(([, key, label]) => ({ key, label }));
  assert.ok(bands.length >= 3, 'expected the price bands in the filter module');

  for (const { key, label } of bands) {
    const button = html.match(new RegExp(`<button data-filter="${key}">([^<]*)</button>`));
    assert.ok(button, `the shell is missing the ${key} button`);
    assert.equal(button[1], label,
      `the shell shows "${button[1]}" until the runtime replaces it with "${label}"`);
  }

  // The module deletes this one, so shipping it means showing a band that vanishes.
  assert.doesNotMatch(html, /data-filter="premium"/);

  // A hardcoded date is a lie from the moment it is written. The stock client fills these
  // in once it knows them.
  assert.doesNotMatch(html, /Last restock check: \d/,
    'the shell must not bake a restock date it cannot know');
  assert.doesNotMatch(html, /Last full sweep: \d/);
});
