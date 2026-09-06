import test from 'node:test';
import assert from 'node:assert/strict';

test('print current production unavailable stock keys for audit', async () => {
  const response = await fetch('https://cigar-catalogue.psncodex.workers.dev/api/stock', {
    headers: { accept: 'application/json' }
  });
  assert.equal(response.ok, true, `production /api/stock returned ${response.status}`);
  const payload = await response.json();
  const unavailable = Object.entries(payload?.results || {})
    .filter(([, value]) => value?.status === 'out' || value?.status === 'delisted')
    .map(([key, value]) => ({ key, status: value.status, checkedAt: value.checkedAt, retailers: value.retailers || [] }));
  console.log('LIVE_UNAVAILABLE_SNAPSHOT=' + JSON.stringify(unavailable));
  assert.ok(Array.isArray(unavailable));
});
