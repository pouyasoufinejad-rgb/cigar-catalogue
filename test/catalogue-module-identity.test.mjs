import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the browser import graph loads each catalogue module under one URL', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const queue = [new URL('../public/catalogue-runtime.mjs', import.meta.url)];
  for (const [, src] of html.matchAll(/<script\b[^>]*src="(\/[^"?#]+\.mjs(?:\?[^"#]*)?)"/g)) {
    queue.push(new URL(`../public${src}`, import.meta.url));
  }
  const seen = new Set();
  const urlsByFile = new Map();
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const urls = urlsByFile.get(url.pathname) || new Set();
    urls.add(url.search);
    urlsByFile.set(url.pathname, urls);
    const code = await readFile(url, 'utf8');
    for (const [, specifier] of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+\.mjs(?:\?[^'"]*)?)['"]/g)) {
      if (specifier.startsWith('.')) queue.push(new URL(specifier, url));
    }
  }
  const duplicates = [...urlsByFile].filter(([, urls]) => urls.size > 1);
  assert.deepEqual(duplicates.map(([file, urls]) => [file, [...urls]]), [], 'duplicate URLs also duplicate module state and startup effects');
});
