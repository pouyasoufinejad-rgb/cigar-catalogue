#!/usr/bin/env node
// Lifts the artwork baked into index.html as base64 out into real files.
//
// The page is 5.7MB, 94% of it base64 WebP inside <img src>. Base64 costs a third more
// than the bytes it carries, none of it can be lazy-loaded, none of it can be cached apart
// from the document, and the document is rewritten per request. So every visit re-downloads
// every image whether or not the reader ever scrolls to it.
//
// Only <img> sources are moved. The medal wreaths and country flags are also data URIs but
// they are small, repeated across every card, and cheaper inline than as extra requests.
//
// Run with --write to apply; without it the script only reports.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pageUrl = new URL('../public/index.html', import.meta.url);
const artDir = new URL('../public/art/', import.meta.url);
const write = process.argv.includes('--write');

const IMG_WITH_DATA = /<img\b([^>]*?)\bsrc=(["'])(data:image\/(webp|png|jpeg|jpg);base64,([A-Za-z0-9+/=]+))\2([^>]*)>/gi;

export function fileNameFor(bytes, extension, hint) {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
  const stem = String(hint || '').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48).toLowerCase();
  return `${stem ? `${stem}-` : ''}${hash}.${extension}`;
}

// The nearest preceding data-key, so a file is named after the card it belongs to. Purely
// cosmetic: the hash is what makes the name unique and safe to cache forever.
export function hintForOffset(html, offset) {
  const before = html.slice(0, offset);
  const key = [...before.matchAll(/data-key=["']([^"']+)["']/g)].pop();
  return key ? key[1] : '';
}

export function rewritePage(html) {
  const files = [];
  const out = html.replace(IMG_WITH_DATA, (match, pre, quote, _uri, type, base64, post, offset) => {
    const extension = type.toLowerCase() === 'jpg' ? 'jpeg' : type.toLowerCase();
    const bytes = Buffer.from(base64, 'base64');
    const name = fileNameFor(bytes, extension, hintForOffset(html, offset));
    files.push({ name, bytes, base64 });
    const attrs = `${pre}${post}`;
    // The frame is a fixed 360px tall with the image at height:100%, so nothing reflows
    // when an image arrives late. That is what makes lazy loading safe here.
    const lazy = /\bloading=/.test(attrs) ? '' : ' loading="lazy"';
    const async = /\bdecoding=/.test(attrs) ? '' : ' decoding="async"';
    return `<img${pre}src=${quote}/art/${name}${quote}${lazy}${async}${post}>`;
  });
  return { html: out, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = await readFile(pageUrl, 'utf8');
  const { html: next, files } = rewritePage(html);
  const saved = html.length - next.length;
  console.log(`${files.length} images, ${(saved / 1048576).toFixed(2)}MB out of the document`);
  console.log(`index.html ${(html.length / 1048576).toFixed(2)}MB -> ${(next.length / 1048576).toFixed(2)}MB`);
  if (!write) { console.log('(dry run, pass --write to apply)'); process.exit(0); }

  await mkdir(artDir, { recursive: true });
  const seen = new Map();
  for (const file of files) {
    const previous = seen.get(file.name);
    // Same name means same hash means same bytes. Writing it twice is harmless, but a
    // mismatch would mean the hash is not doing its job.
    if (previous && !previous.equals(file.bytes)) throw new Error(`hash collision on ${file.name}`);
    seen.set(file.name, file.bytes);
    await writeFile(new URL(file.name, artDir), file.bytes);
  }
  await writeFile(pageUrl, next);
  console.log(`wrote ${seen.size} files to public/art/`);
}
