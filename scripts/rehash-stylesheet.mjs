#!/usr/bin/env node
// Renames the extracted stylesheet to match a hash of its current contents and repoints the
// page at it.
//
// The extractor only runs when there is an inline <style> block to fold in. Editing the
// already-extracted stylesheet directly leaves its name describing contents it no longer
// has, and /css/* is served immutable, so browsers would keep the old rules forever.
//
// Run with --write to apply; --check exits non-zero if the name and the contents disagree.

import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pageUrl = new URL('../public/index.html', import.meta.url);
const cssDir = new URL('../public/css/', import.meta.url);
const LINK_RX = /<link rel="stylesheet" href="\/css\/(catalogue-[0-9a-f]{10}\.css)">/;

export function hashedName(css) {
  return `catalogue-${createHash('sha256').update(css).digest('hex').slice(0, 10)}.css`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const page = await readFile(pageUrl, 'utf8');
  const current = page.match(LINK_RX)?.[1];
  if (!current) throw new Error('The page links no extracted stylesheet.');
  const css = await readFile(new URL(current, cssDir), 'utf8');
  const next = hashedName(css);

  if (next === current) { console.log(`${current} already matches its contents`); process.exit(0); }
  console.log(`${current} -> ${next}`);
  if (process.argv.includes('--check')) {
    console.error('the stylesheet name no longer matches its contents; run with --write');
    process.exit(1);
  }
  if (!process.argv.includes('--write')) { console.log('(dry run, pass --write)'); process.exit(0); }
  await rename(new URL(current, cssDir), new URL(next, cssDir));
  await writeFile(pageUrl, page.replace(LINK_RX, `<link rel="stylesheet" href="/css/${next}">`));
  console.log('written');
}
