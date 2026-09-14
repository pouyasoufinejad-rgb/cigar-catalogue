import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyLiveCodeReady } from '../scripts/verify-live-code-ready.mjs';
import { verifyLiveRecommendationV4 } from '../scripts/verify-live-recommendation-v4.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';

function fakeFetch({ version = 4, joyaSection = 'coronets', runtimeVersion = '20260914-v7' } = {}) {
  const state = {
    version,
    cards: {
      'joya-black': { catalogueType: 'main', archived: false },
      'kfc-ponies-sweets': { catalogueType: 'main', archived: false },
      h1: { catalogueType: 'half', archived: false, rank: 1 },
      t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
    },
    entries: {},
    sections: {},
    ...(version === 4 ? {
      recommendationSubsections: [
        { id: 'coronets', name: 'Coronets', description: '', entryKeys: joyaSection === 'coronets' ? ['joya-black', 'kfc-ponies-sweets'] : ['kfc-ponies-sweets'] },
        { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: [] },
        { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: joyaSection === 'flavoured' ? ['joya-black'] : [] }
      ]
    } : {})
  };
  const html = `<script type="module" src="/catalogue-runtime.mjs?v=${runtimeVersion}"></script>
    <article class="card" data-key="joya-black" data-catalogue-type="main" data-rank="4"><div class="artframe" data-visual-ring="32"></div><div class="artmeta-left">Wrapper: Mexico</div></article>
    <article class="card" data-key="kfc-ponies-sweets" data-catalogue-type="main" data-rank="2"><div class="artframe" data-visual-ring="32"></div><div class="artmeta-left">Wrapper: USA</div></article>
    <article class="card" data-key="h1" data-catalogue-type="half" data-rank="1"><div class="artframe" data-visual-ring="50"></div></article>
    <article class="card" data-key="t1" data-catalogue-type="taster" data-taster="1" data-rank="1"><div class="artframe" data-visual-ring="30"></div></article>`;

  return async url => {
    const href = String(url);
    if (href.includes('catalogue-runtime.mjs')) {
      return new Response(`
        await import('./catalogue-convenience.mjs?v=${runtimeVersion}');
        await import('./catalogue-recommendation-subsections.mjs?v=${runtimeVersion}');
        import('./catalogue-structure-editor.mjs?v=${runtimeVersion}');
      `, { status: 200 });
    }
    if (href.includes('catalogue-recommendation-subsections.mjs')) return new Response('const recommendationSubsections = true; const attr="data-recommendation-subsection"; const grid="recommendation-subsection-grid";', { status: 200 });
    if (href.includes('catalogue-structure-editor.mjs')) return new Response('const a="catalogue-admin-recommendation-subsection"; const b="catalogue-admin-subsection-manager";', { status: 200 });
    if (href.includes('catalogue-structure.mjs')) return new Response('export const CATALOGUE_STATE_VERSION = 4;', { status: 200 });
    if (href.includes('/api/catalogue-overrides')) return new Response(JSON.stringify(state), { status: 200, headers: { 'content-type': 'application/json' } });
    if (href.startsWith(`${BASE}/?`)) return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    throw new Error(`Unexpected URL ${href}`);
  };
}

test('code readiness accepts the real dedicated v4 Recommendation subsection markers while state is still v3', async () => {
  const result = await verifyLiveCodeReady({ fetchImpl: fakeFetch({ version: 3 }), baseUrl: BASE });
  assert.deepEqual(result, { ok: true, stateVersion: 3 });
});

test('code readiness rejects a stale v6 bootstrap and runtime chain', async () => {
  await assert.rejects(
    verifyLiveCodeReady({ fetchImpl: fakeFetch({ runtimeVersion: '20260914-v5' }), baseUrl: BASE }),
    /v7 runtime bootstrap/i
  );
});

test('final verifier requires state v4 and validates inventory plus Joya placement', async () => {
  const result = await verifyLiveRecommendationV4({ fetchImpl: fakeFetch({ version: 4 }), baseUrl: BASE });
  assert.equal(result.ok, true);
  assert.equal(result.recommendationCount, 2);
  assert.equal(result.joyaSubsection, 'coronets');
});

test('final verifier rejects Joya Black in flavoured subsection', async () => {
  await assert.rejects(
    verifyLiveRecommendationV4({ fetchImpl: fakeFetch({ version: 4, joyaSection: 'flavoured' }), baseUrl: BASE }),
    /Joya Black.*Flavoured/i
  );
});

test('final verifier rejects pre-migration v3 state', async () => {
  await assert.rejects(
    verifyLiveRecommendationV4({ fetchImpl: fakeFetch({ version: 3 }), baseUrl: BASE }),
    /expected v4/i
  );
});
