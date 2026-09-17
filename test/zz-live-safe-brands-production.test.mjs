import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';

async function fetchText(path) {
  const response = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}verify=${Date.now()}`, { cache:'no-store' });
  const text = await response.text();
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  return text;
}

test('production serves the restored 1:21 sidebar with the safe compact Brands wrapper', async () => {
  const [runtime, sidebar, compact, html] = await Promise.all([
    fetchText('/catalogue-runtime.mjs'),
    fetchText('/catalogue-control-sidebar.mjs'),
    fetchText('/catalogue-brand-sidebar-compact.mjs'),
    fetchText('/')
  ]);

  assert.match(runtime, /catalogue-control-sidebar\.mjs\?v=sidebar-controls-5/);
  assert.match(runtime, /catalogue-brand-sidebar-compact\.mjs\?v=safe-brands-1/);

  assert.match(sidebar, /BRAND_LINE_CONFIG/);
  assert.match(sidebar, /const STATE_API = ['"]\/api\/catalogue-overrides['"]/);
  assert.match(sidebar, /const IMAGE_API = ['"]\/api\/catalogue-image\//);
  assert.doesNotMatch(sidebar, /method\s*:\s*['"]PUT['"][\s\S]{0,350}catalogue-overrides/i);
  assert.doesNotMatch(sidebar, /catalogue-overrides[\s\S]{0,350}method\s*:\s*['"]PUT['"]/i);

  assert.match(compact, /data-brand-sidebar/);
  assert.match(compact, /createElement\(['"]details['"]\)/);
  assert.match(compact, /createElement\(['"]summary['"]\)/);
  assert.doesNotMatch(compact, /\.open\s*=\s*true/);
  assert.doesNotMatch(compact, /\/api\/catalogue-overrides/);

  assert.match(html, /Arturito/i);
  assert.match(html, /data-key=["']liga-privada-h99-papas-fritas["']/);
  assert.match(html, /data-key=["']undercrown-10-corona-viva["']/);
});
