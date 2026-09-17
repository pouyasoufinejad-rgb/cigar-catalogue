import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCheckpointState,
  TARGET_ADDITION_KEYS,
  TARGET_COMMIT,
  POST_TARGET_KEY
} from '../scripts/restore-checkpoint-2026-09-16-1028.mjs';

const requestOverrides = {
  'la-flor-dominicana-la-nox-petit': {
    brand:'La Flor Dominicana',
    title:'La Nox Petit — Single',
    ring:40,
    productionLines:['Handmade','Wrapper: Brazilian Maduro'],
    practicalLines:['Single cigar','5″ × 40 Petit']
  },
  'my-father-la-gran-oferta-lancero': {
    brand:'My Father',
    title:'La Gran Oferta Lancero — Box of 20',
    ring:38,
    productionLines:['Handmade','Wrapper: Habano Rosado'],
    practicalLines:['Box of 20 cigars','7.5″ × 38 Lancero']
  }
};

const requests = TARGET_ADDITION_KEYS.map(key => ({
  operation:'upsert-entry',
  key,
  entry:{
    brand:`Brand ${key}`,
    title:`Title ${key}`,
    catalogueType:'main',
    ring:40,
    productionLines:['Handmade'],
    practicalLines:['Single cigar'],
    ...(requestOverrides[key] || {})
  }
}));

const html = `
<article class="card" data-key="static-one"><div class="artmeta-left"><span class="artmeta-title">Production</span><span class="artmeta-line">Original wrapper</span></div><div class="artmeta-right"><span class="artmeta-title">Practical</span><span class="artmeta-line">Original format</span></div></article>`;

const reversedTargetKeys = [...TARGET_ADDITION_KEYS].reverse();

test('checkpoint identifier is pinned to the verified Sep 16 morning commit', () => {
  assert.equal(TARGET_COMMIT, '287f7fc5e2e612463f09a91bf59cc9ad7d8e5dc9');
  assert.equal(POST_TARGET_KEY, 'drew-estate-acid-krush-red-cameroon');
});

test('restore removes post-checkpoint catalogue and sidebar state', () => {
  const current = {
    version:3,
    cards:{
      [POST_TARGET_KEY]:{ rank:1 },
      'static-one':{ productionHtml:'<span class="artmeta-line">Normalised</span>', practicalHtml:'<span class="artmeta-line">Normalised</span>' }
    },
    sections:{
      legendHtml:'legend', benchmarksHtml:'benchmarks', brandLogos:{ davidoff:{ size:32 } }, hiddenBrands:['foo'],
      recommendationSubsections:[{ id:'petit-panatelas', title:'Petit', note:'', entryKeys:[POST_TARGET_KEY,'static-one'] }]
    },
    entries:{ [POST_TARGET_KEY]:{ key:POST_TARGET_KEY, brand:'Drew Estate', title:'ACID' } }
  };
  const restored = buildCheckpointState({ current, targetRequests:requests, targetHtml:html });
  assert.equal(restored.entries[POST_TARGET_KEY], undefined);
  assert.equal(restored.cards[POST_TARGET_KEY], undefined);
  assert.equal(restored.sections.brandLogos, undefined);
  assert.equal(restored.sections.hiddenBrands, undefined);
  assert.deepEqual(restored.sections.recommendationSubsections[0].entryKeys, [...reversedTargetKeys, 'static-one']);
  assert.match(restored.cards['static-one'].productionHtml, /Original wrapper/);
  assert.match(restored.cards['static-one'].practicalHtml, /Original format/);
});

test('target morning additions are restored from their publication requests and rejoin main recommendation ranking', () => {
  const current = {
    version:3,
    cards:{
      'la-flor-dominicana-la-nox-petit':{ catalogueType:'main', rank:9, imageUrl:'/api/catalogue-image/la-flor-dominicana-la-nox-petit?v=recovery-20260917' },
      'my-father-la-gran-oferta-lancero':{ catalogueType:'half', rank:3, imageUrl:'/api/catalogue-image/my-father-la-gran-oferta-lancero?v=recovery-20260917' }
    },
    sections:{ recommendationSubsections:[{ id:'petit-panatelas', title:'Petit', note:'', entryKeys:['older'] }] },
    entries:{
      'la-flor-dominicana-la-nox-petit':{ key:'la-flor-dominicana-la-nox-petit', brand:'Wrong', title:'Wrong', productionLines:['Normalised'] },
      'my-father-la-gran-oferta-lancero':{ key:'my-father-la-gran-oferta-lancero', brand:'Wrong', title:'Wrong', productionLines:['Normalised'] }
    }
  };
  const restored = buildCheckpointState({ current, targetRequests:requests, targetHtml:'' });
  assert.equal(restored.entries['la-flor-dominicana-la-nox-petit'].brand, 'La Flor Dominicana');
  assert.deepEqual(restored.entries['my-father-la-gran-oferta-lancero'].productionLines, ['Handmade','Wrapper: Habano Rosado']);
  assert.equal(restored.cards['my-father-la-gran-oferta-lancero'].catalogueType, 'main');
  assert.equal(restored.cards['my-father-la-gran-oferta-lancero'].imageUrl, undefined);
  assert.equal(restored.cards['la-flor-dominicana-la-nox-petit'].imageUrl, undefined);
  assert.deepEqual(restored.sections.recommendationSubsections[0].entryKeys, [...reversedTargetKeys, 'older']);
  assert.equal(restored.cards['my-father-la-gran-oferta-lancero'].rank, reversedTargetKeys.indexOf('my-father-la-gran-oferta-lancero') + 1);
  assert.equal(restored.cards['la-flor-dominicana-la-nox-petit'].rank, reversedTargetKeys.indexOf('la-flor-dominicana-la-nox-petit') + 1);
});
