import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { injectEntriesIntoHtml } from '../src/index.js';

function parseJsonc(text) {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
}

test('root catalogue HTML is routed through the Worker before assets', async () => {
  const config = parseJsonc(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const routes = config.assets?.run_worker_first;
  assert.ok(Array.isArray(routes));
  assert.ok(routes.includes('/'), 'run_worker_first must include /');
  assert.ok(routes.includes('/index.html'), 'run_worker_first must include /index.html');
});

test('KV-only dynamic entry is injected into catalogue HTML', () => {
  const html = '<!doctype html><html><body><div id="flat-main"></div></body></html>';
  const transformed = injectEntriesIntoHtml(html, {
    'kv-only-test': {
      key: 'kv-only-test',
      brand: 'Test Brand',
      title: 'KV-only cigar',
      price: 12,
      quality: 7,
      strength: 6,
      length: 4,
      ring: 32,
      rank: 1,
      risk: 1
    }
  });

  assert.match(transformed, /data-dynamic-entry="1"/);
  assert.match(transformed, /data-key="kv-only-test"/);
  assert.match(transformed, /Test Brand/);
  assert.match(transformed, /KV-only cigar/);
});
