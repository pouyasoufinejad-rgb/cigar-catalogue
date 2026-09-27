import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  '../public/catalogue-runtime.mjs',
  '../public/catalogue-flavour.mjs',
  '../public/catalogue-size-value-runtime.mjs',
  '../public/catalogue-variant-edit-model.mjs',
  '../public/catalogue-variant-editor.mjs',
  '../public/catalogue-variant-runtime.mjs',
  '../public/catalogue-variants.mjs'
];

const sources = await Promise.all(files.map(path => readFile(new URL(path, import.meta.url), 'utf8')));

function specifiers(source) {
  return [...source.matchAll(/(?:from\s+|import\()\s*['"]([^'"]+\.mjs(?:\?[^'"]*)?)['"]/g)].map(match => match[1]);
}

function urlsFor(baseName) {
  return sources.flatMap(specifiers).filter(spec => spec.split('?')[0].endsWith('/' + baseName) || spec.split('?')[0].endsWith(baseName));
}

test('hot runtime dependencies use one URL each so the browser executes one module instance', () => {
  const expected = new Map([
    ['catalogue-variants.mjs', './catalogue-variants.mjs?v=module-dedupe-1'],
    ['catalogue-flavour.mjs', './catalogue-flavour.mjs?v=module-dedupe-1'],
    ['catalogue-size-value-runtime.mjs', './catalogue-size-value-runtime.mjs?v=module-dedupe-1'],
    ['catalogue-variant-runtime.mjs', './catalogue-variant-runtime.mjs?v=module-dedupe-1'],
    ['catalogue-flavour-axes.mjs', './catalogue-flavour-axes.mjs?v=coffee-axis-1'],
    ['catalogue-size-presentation.mjs', './catalogue-size-presentation.mjs?v=short-penalty-1']
  ]);

  for (const [baseName, canonical] of expected) {
    const urls = [...new Set(urlsFor(baseName))];
    assert.deepEqual(urls, [canonical], `${baseName} should have one canonical module URL, got ${urls.join(', ')}`);
  }
});
