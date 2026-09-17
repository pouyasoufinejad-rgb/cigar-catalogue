import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVerifiedPlacementImageRepair,
  assertRepair,
  TASTER_REPAIRS,
  VERIFIED_IMAGE_KEYS
} from '../scripts/repair-live-placement-images.mjs';

const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  return {
    version:3,
    cards:{
      'keep-a':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:1, eyebrow:'keep A' },
      'liga-privada-h99-papas-fritas':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:2, imageUrl:'/api/catalogue-image/liga-privada-h99-papas-fritas?v=existing', quality:8 },
      'liga-privada-unico-nasty-fritas':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:3, imageUrl:'/api/catalogue-image/liga-privada-unico-nasty-fritas?v=existing', quality:8 },
      'keep-b':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:4, eyebrow:'keep B' },
      'undercrown-10-corona-viva':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:5, imageUrl:'/api/catalogue-image/undercrown-10-corona-viva?v=existing', quality:8 },
      'keep-c':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:6, eyebrow:'keep C' },
      'nica-rustica-broadleaf-short-robusto':{ taster:true, rank:9, quality:7 },
      'liga-privada-unico-papas-fritas':{ taster:true, rank:10, quality:8 },
      'ashton-vsg-enchantment':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:7, imageUrl:'', quality:8 },
      'drew-estate-acid-krush-red-cameroon':{ catalogueType:'main', taster:false, subsection:'coronets-cigarillos', rank:1, imageUrl:'', flavour:8 }
    },
    entries:{
      'liga-privada-h99-papas-fritas':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:2, price:30.7 },
      'liga-privada-unico-nasty-fritas':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:3, price:41 },
      'undercrown-10-corona-viva':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:5, price:39 },
      'nica-rustica-broadleaf-short-robusto':{ taster:true, rank:9, price:39 },
      'liga-privada-unico-papas-fritas':{ taster:true, rank:10, price:30.7 }
    },
    sections:{
      recommendationSubsections:[
        { id:'coronets-cigarillos', title:'Coronets', entryKeys:['drew-estate-acid-krush-red-cameroon'] },
        { id:'petit-panatelas', title:'Petit', entryKeys:['keep-a','liga-privada-h99-papas-fritas','liga-privada-unico-nasty-fritas','keep-b','undercrown-10-corona-viva','keep-c','ashton-vsg-enchantment'] },
        { id:'flavoured-infused', title:'Flavoured', entryKeys:[] }
      ],
      legendHtml:'do not touch'
    }
  };
}

test('repair restores the five Sep 16 Drew Estate cards to exact Taster ranks 8 through 12 without persisting entry catalogueType', () => {
  const before = fixture();
  const repaired = applyVerifiedPlacementImageRepair(before);
  assert.deepEqual(TASTER_REPAIRS.map(item => [item.key,item.rank]), [
    ['liga-privada-h99-papas-fritas',8],
    ['nica-rustica-broadleaf-short-robusto',9],
    ['liga-privada-unico-papas-fritas',10],
    ['liga-privada-unico-nasty-fritas',11],
    ['undercrown-10-corona-viva',12]
  ]);
  for (const { key, rank } of TASTER_REPAIRS) {
    assert.equal(repaired.cards[key].catalogueType, 'taster', key);
    assert.equal(repaired.cards[key].taster, true, key);
    assert.equal(repaired.cards[key].rank, rank, key);
    assert.equal('subsection' in repaired.cards[key], false, `${key} card subsection must be removed`);
    assert.equal('catalogueType' in repaired.entries[key], false, `${key} entry catalogueType is not persisted by the Worker`);
    assert.equal(repaired.entries[key].taster, true, `${key} entry`);
    assert.equal(repaired.entries[key].rank, rank, `${key} entry`);
    assert.equal('subsection' in repaired.entries[key], false, `${key} entry subsection must be removed`);
  }
});

test('read-back verification accepts the Worker contract where entry catalogueType is absent', () => {
  const persisted = applyVerifiedPlacementImageRepair(fixture());
  for (const { key } of TASTER_REPAIRS) delete persisted.entries[key].catalogueType;
  assert.doesNotThrow(() => assertRepair(persisted, []));
});

test('repair removes Tasters from recommendation subsections and compacts only the affected main ranks', () => {
  const repaired = applyVerifiedPlacementImageRepair(fixture());
  const petit = repaired.sections.recommendationSubsections.find(section => section.id === 'petit-panatelas');
  assert.deepEqual(petit.entryKeys, ['keep-a','keep-b','keep-c','ashton-vsg-enchantment']);
  petit.entryKeys.forEach((key,index) => assert.equal(repaired.cards[key].rank,index+1,key));
  assert.equal(repaired.sections.legendHtml, 'do not touch');
});

test('repair restores only verified missing same-key image references and preserves existing image URLs', () => {
  const repaired = applyVerifiedPlacementImageRepair(fixture());
  assert.ok(VERIFIED_IMAGE_KEYS.includes('ashton-vsg-enchantment'));
  assert.equal(repaired.cards['ashton-vsg-enchantment'].imageUrl, '/api/catalogue-image/ashton-vsg-enchantment?v=recovery-20260918');
  assert.equal(repaired.cards['drew-estate-acid-krush-red-cameroon'].imageUrl, '/api/catalogue-image/drew-estate-acid-krush-red-cameroon?v=recovery-20260918');
  assert.equal(repaired.cards['liga-privada-h99-papas-fritas'].imageUrl, '/api/catalogue-image/liga-privada-h99-papas-fritas?v=existing');
});

test('repair is immutable and preserves unrelated catalogue content', () => {
  const before = fixture();
  const snapshot = clone(before);
  const repaired = applyVerifiedPlacementImageRepair(before);
  assert.deepEqual(before, snapshot, 'input state must not be mutated');
  assert.equal(repaired.cards['liga-privada-h99-papas-fritas'].quality, 8);
  assert.equal(repaired.entries['liga-privada-h99-papas-fritas'].price, 30.7);
  assert.equal(repaired.cards['keep-a'].eyebrow, 'keep A');
  assert.equal(repaired.cards['drew-estate-acid-krush-red-cameroon'].flavour, 8);
});
