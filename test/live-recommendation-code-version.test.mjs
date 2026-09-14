import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const localUrl = new URL('../public/catalogue-recommendation-cohorts.mjs', import.meta.url);

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('read-only deployed recommendation code diagnostic', async () => {
  const local = await readFile(localUrl, 'utf8');
  const response = await fetch(`${BASE}/catalogue-recommendation-cohorts.mjs?diag=${Date.now()}`, {
    headers: { accept: 'text/javascript' },
    cache: 'no-store'
  });
  assert.equal(response.status, 200);
  const live = await response.text();
  console.log('LIVE_RECOMMENDATION_CODE ' + JSON.stringify({
    same: local === live,
    localSha256: sha(local),
    liveSha256: sha(live),
    liveScansWholeCardText: /card\?\.textContent|card\.textContent/.test(live),
    liveUsesProductionText: /productionTextForCard/.test(live),
    livePersistsRecommendationRank: /recommendationRank/.test(live),
    liveReusesEliteSection: /data-tier-section=["']elite|data-tier-section=\\[?['"]elite/.test(live) || /\[data-tier-section="elite"\]/.test(live),
    liveLength: live.length,
    localLength: local.length
  }));
});
