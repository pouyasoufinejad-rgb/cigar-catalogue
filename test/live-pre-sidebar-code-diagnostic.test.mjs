import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';

async function getText(path) {
  const response = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}diag=${Date.now()}-${Math.random()}`, { cache:'no-store' });
  const body = await response.text();
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  return body;
}

test('live Worker serves the pre-sidebar application and restored Arturito catalogue state', async () => {
  const sidebar = await getText('/catalogue-control-sidebar.mjs');
  assert.equal(sidebar.includes('BRAND_LINE_CONFIG'), false, 'Sep 17 brand/line filter code is still live.');
  assert.equal(sidebar.includes('BRAND_LINE_QUERY_PARAM'), false, 'Sep 17 brandLine URL filter code is still live.');
  assert.match(sidebar, /catalogue-control-sidebar-style-v1/, 'Expected pre-sidebar control-sidebar module is not live.');

  const html = await getText('/');
  assert.match(html, /Arturito/i, 'Rendered production does not contain the Arturito fingerprint.');
  assert.match(html, /data-key=["']drew-estate-acid-krush-red-cameroon["']/i, 'Rendered production does not contain ACID Krush Red Cameroon.');
});
