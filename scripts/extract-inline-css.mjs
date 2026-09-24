#!/usr/bin/env node
// Moves the 27 <style> blocks in the head into one stylesheet.
//
// They are 306KB of the document's 710KB, and the document is rewritten per request with
// its ETag stripped at the edge, so all of it is re-sent on every single navigation. As a
// file under a content-hashed name it is fetched once and never again.
//
// Order is the whole game. These blocks override one another by document order, and this
// session has spent a lot of time on exactly those ties, so the concatenation keeps them in
// the order they appeared and the link goes where the first block was. Stylesheets the
// runtime injects are appended to the head at runtime and so still win, as before.
//
// Run with --write to apply; --check exits non-zero if index.html is out of sync.

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pageUrl = new URL('../public/index.html', import.meta.url);
const cssDir = new URL('../public/css/', import.meta.url);
const STYLE_RX = /[ \t]*<style([^>]*)>([\s\S]*?)<\/style>\n?/g;
const LINK_RX = /<link rel="stylesheet" href="\/css\/(catalogue-[0-9a-f]{10}\.css)">/;

export function collect(html) {
  const head = html.indexOf('</head>');
  const blocks = [];
  for (const match of html.matchAll(STYLE_RX)) {
    if (match.index > head && head >= 0) continue; // body styles would change meaning if moved
    blocks.push({ attrs: match[1], css: match[2], index: match.index, raw: match[0] });
  }
  return blocks;
}

// Each block keeps a comment naming where it came from, so a future reader can still find
// the rule they are looking for by the id it used to carry.
export function concatenate(blocks) {
  return blocks.map(block => {
    const id = block.attrs.match(/id=["']([^"']+)["']/)?.[1];
    return `${id ? `/* ${id} */\n` : ''}${block.css.trim()}\n`;
  }).join('\n');
}

export function cssFileName(css) {
  return `catalogue-${createHash('sha256').update(css).digest('hex').slice(0, 10)}.css`;
}

export function rewritePage(html, fileName) {
  const blocks = collect(html);
  if (!blocks.length) return html;
  const link = `<link rel="stylesheet" href="/css/${fileName}">`;
  let seen = 0;
  return html.replace(STYLE_RX, (raw, _attrs, _css, offset) => {
    if (!blocks.some(block => block.index === offset)) return raw;
    seen += 1;
    return seen === 1 ? `  ${link}\n` : '';
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = await readFile(pageUrl, 'utf8');
  const blocks = collect(html);
  if (!blocks.length) {
    const current = html.match(LINK_RX);
    console.log(current ? `already extracted: ${current[1]}` : 'nothing to extract');
    process.exit(0);
  }
  const css = concatenate(blocks);
  const name = cssFileName(css);
  const next = rewritePage(html, name);
  console.log(`${blocks.length} blocks, ${(css.length / 1024).toFixed(0)}KB -> /css/${name}`);
  console.log(`index.html ${(html.length / 1024).toFixed(0)}KB -> ${(next.length / 1024).toFixed(0)}KB`);
  if (!process.argv.includes('--write')) { console.log('(dry run, pass --write)'); process.exit(0); }

  await mkdir(cssDir, { recursive: true });
  for (const stale of await readdir(cssDir).catch(() => [])) {
    if (stale !== name) await rm(new URL(stale, cssDir));
  }
  await writeFile(new URL(name, cssDir), css);
  await writeFile(pageUrl, next);
  console.log('written');
}
