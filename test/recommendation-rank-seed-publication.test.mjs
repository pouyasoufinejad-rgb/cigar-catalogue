import test from 'node:test';
import assert from 'node:assert/strict';

import { publishRecommendationRankSeedDocument } from '../scripts/seed-live-recommendation-ranks.mjs';

function card(key, { rank, type = 'main', ring = 32, production = 'Handmade', classes = 'card', stock = '' } = {}) {
  return `<article class="${classes}" data-key="${key}" data-rank="${rank}" data-catalogue-type="${type}"${stock ? ` data-stock-pin="${stock}"` : ''}>
    <div class="artframe" data-visual-ring="${ring}"></div>
    <div class="artmeta-left"><span class="artmeta-line">${production}</span></div>
  </article>`;
}

function fixtureState() {
  return {
    version: 3,
    sections: { introHtml: '<p>Untouched</p>' },
    cards: {
      'joya-black-cigarillo': {
        title: 'JOYA Black Cigarillos — Pack of 10',
        eyebrow: 'Sweet San Andrés quick-smoke candidate',
        summaryHtml: 'Joya describes it as full-flavoured.',
        rank: 7,
        strength: 6,
        quality: 7,
        price: 11.9,
        packagePrice: 119,
        retailerLinks: ['https://example.test/joya']
      },
      'coronet-a': { title: 'Coronet A', rank: 2, quality: 8 },
      'petit-a': { title: 'Petit A', rank: 1, quality: 8 },
      'flavoured-a': { title: 'Flavoured A', rank: 3, quality: 8 },
      'taster-a': { title: 'Taster A', rank: 1, catalogueType: 'taster', taster: true },
      'half-a': { title: 'Half A', rank: 1, catalogueType: 'half', taster: false },
      'out-a': { title: 'Out A', rank: 4, stockPin: 'out' }
    },
    entries: {
      'joya-black-cigarillo': {
        brand: 'Joya de Nicaragua',
        ring: 32,
        productionLines: ['Handmade in Nicaragua', 'Wrapper: Mexican San Andrés', 'Binder: Nicaraguan', 'Filler: Nicaraguan']
      },
      'coronet-a': { brand: 'A', ring: 34 },
      'petit-a': { brand: 'B', ring: 40 },
      'flavoured-a': { brand: 'C', ring: 30, productionLines: ['Flavoured', 'Handmade'] },
      'taster-a': { brand: 'T', ring: 40, taster: true },
      'half-a': { brand: 'H', ring: 50, catalogueType: 'half', taster: false },
      'out-a': { brand: 'O', ring: 32 }
    }
  };
}

function fixtureHtml() {
  return [
    card('petit-a', { rank: 1, ring: 40 }),
    card('coronet-a', { rank: 2, ring: 34 }),
    card('flavoured-a', { rank: 3, ring: 30, production: 'Flavoured' }),
    card('out-a', { rank: 4, ring: 32, classes: 'card is-unavailable', stock: 'out' }),
    card('joya-black-cigarillo', { rank: 7, ring: 32, production: 'Handmade in Nicaragua Wrapper: Mexican San Andrés Binder: Nicaraguan Filler: Nicaraguan' }),
    card('taster-a', { rank: 1, type: 'taster', ring: 40 }),
    card('half-a', { rank: 1, type: 'half', ring: 50 })
  ].join('\n');
}

test('live seed reads KV first, changes only subsection metadata, authenticates PUT, and verifies read-back', async () => {
  const original = fixtureState();
  let current = structuredClone(original);
  const html = fixtureHtml();
  const calls = [];
  let putHeaders = null;
  let outgoing = null;

  const fetchImpl = async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    calls.push({ url: String(url), method });

    if (String(url).includes('/api/catalogue-overrides') && method === 'GET') {
      return new Response(JSON.stringify(current), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).includes('/api/catalogue-overrides') && method === 'PUT') {
      putHeaders = new Headers(options.headers || {});
      outgoing = JSON.parse(String(options.body || '{}'));
      current = structuredClone(outgoing);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).includes('/?catalogue_source=')) {
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  };

  const result = await publishRecommendationRankSeedDocument(
    { operation: 'seed-recommendation-ranks' },
    { fetchImpl, token: 'secret-token', baseUrl: 'https://example.test' }
  );

  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, 'https://example.test/api/catalogue-overrides');
  assert.equal(putHeaders.get('authorization'), 'Bearer secret-token');
  assert.ok(outgoing);

  assert.deepEqual(result.rankings.coronets, [
    { key: 'coronet-a', rank: 1 },
    { key: 'joya-black-cigarillo', rank: 2 }
  ]);
  assert.deepEqual(result.rankings['petit-panatelas'], [{ key: 'petit-a', rank: 1 }]);
  assert.deepEqual(result.rankings.flavoured, [{ key: 'flavoured-a', rank: 1 }]);
  assert.equal(result.verified, true);

  assert.equal(current.cards['joya-black-cigarillo'].recommendationCohort, 'coronets');
  assert.equal(current.cards['joya-black-cigarillo'].recommendationRank, 2);

  for (const key of Object.keys(original.cards)) {
    const before = { ...original.cards[key] };
    const after = { ...current.cards[key] };
    delete before.recommendationCohort;
    delete before.recommendationRank;
    delete after.recommendationCohort;
    delete after.recommendationRank;
    assert.deepEqual(after, before, `forbidden mutation on ${key}`);
  }

  assert.deepEqual(current.entries, original.entries);
  assert.deepEqual(current.sections, original.sections);
  assert.equal(current.cards['joya-black-cigarillo'].title, 'JOYA Black Cigarillos — Pack of 10');
  assert.equal(current.cards['joya-black-cigarillo'].rank, 7);
  assert.equal(current.cards['taster-a'].rank, 1);
  assert.equal(current.cards['half-a'].rank, 1);
  assert.equal(Object.hasOwn(current.cards['taster-a'], 'recommendationRank'), false);
  assert.equal(Object.hasOwn(current.cards['half-a'], 'recommendationRank'), false);

  const getCalls = calls.filter(call => call.url.includes('/api/catalogue-overrides') && call.method === 'GET');
  assert.ok(getCalls.length >= 2, 'expected post-write KV read-back');
  assert.ok(calls.some(call => call.url.includes('/?catalogue_source=') && call.method === 'GET'), 'expected live HTML read');
});

test('publication refuses any request operation other than seed-recommendation-ranks', async () => {
  await assert.rejects(
    publishRecommendationRankSeedDocument({ operation: 'upsert-entry' }, { fetchImpl: async () => { throw new Error('network should not run'); }, token: 'x', baseUrl: 'https://example.test' }),
    /seed-recommendation-ranks/
  );
});
