import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { completeRankingCards } from '../scripts/publish-catalogue-request.mjs';

test('v4 effective ranking drops stale static active rank when KV marks card archived', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'catalogue-v4-archived-static-'));
  await mkdir(join(repoRoot, 'public'), { recursive: true });
  await writeFile(join(repoRoot, 'public', 'index.html'), `
    <article class="card" data-key="tatiana-dolce-vanilla" data-catalogue-type="main" data-rank="8"></article>
    <article class="card" data-key="active" data-catalogue-type="main" data-rank="1"></article>
  `, 'utf8');

  const state = {
    version: 4,
    cards: {
      'tatiana-dolce-vanilla': {
        catalogueType: 'main',
        archived: true,
        archivedAt: '2026-09-02T00:00:00.000Z'
      }
    },
    sections: {},
    entries: {},
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['active'] }
    ]
  };

  const effective = await completeRankingCards(repoRoot, state, true);
  assert.equal(effective['tatiana-dolce-vanilla'].archived, true);
  assert.equal(Object.hasOwn(effective['tatiana-dolce-vanilla'], 'rank'), false,
    'archived card must not inherit stale data-rank from static HTML');
  assert.equal(effective.active.rank, 1);
});
