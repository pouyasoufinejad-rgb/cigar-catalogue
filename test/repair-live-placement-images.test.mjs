import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVerifiedPlacementImageRepair,
  assertRepair,
  TASTER_REPAIRS,
  PETIT_REPAIRS,
  ACID_REPAIR,
  ACID_IMAGE_SOURCE_URL,
  VERIFIED_IMAGE_KEYS
} from '../scripts/repair-live-placement-images.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const ACID = 'drew-estate-acid-krush-red-cameroon';
const H99 = 'liga-privada-h99-papas-fritas';
const NASTY = 'liga-privada-unico-nasty-fritas';
const CORONA = 'undercrown-10-corona-viva';
const NICA = 'nica-rustica-broadleaf-short-robusto';
const PAPAS = 'liga-privada-unico-papas-fritas';

function numbered(prefix, count) {
  return Array.from({ length:count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`);
}

function fixture() {
  const coronets = numbered('coronet', 19);
  const petit = numbered('petit', 14);
  const taster = numbered('taster', 5);
  const cards = {};
  const entries = {};

  coronets.forEach((key, index) => { cards[key] = { catalogueType:'main', taster:false, subsection:'coronets-cigarillos', rank:index + 2, eyebrow:key }; });
  petit.forEach((key, index) => { cards[key] = { catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:index + 1, eyebrow:key }; });
  taster.forEach((key, index) => { cards[key] = { catalogueType:'taster', taster:true, rank:index + 1, eyebrow:key }; });

  Object.assign(cards, {
    [ACID]:{ catalogueType:'main', taster:false, subsection:'coronets-cigarillos', rank:1, imageUrl:'', flavour:8, eyebrow:'Sweet-tea infused Cameroon Coronet' },
    [H99]:{ catalogueType:'taster', taster:true, rank:8, imageUrl:'/api/catalogue-image/liga-privada-h99-papas-fritas?v=existing', quality:8 },
    [NICA]:{ catalogueType:'taster', taster:true, rank:9, quality:7 },
    [PAPAS]:{ catalogueType:'taster', taster:true, rank:10, quality:8 },
    [NASTY]:{ catalogueType:'taster', taster:true, rank:11, imageUrl:'/api/catalogue-image/liga-privada-unico-nasty-fritas?v=existing', quality:8 },
    [CORONA]:{ catalogueType:'taster', taster:true, rank:12, imageUrl:'/api/catalogue-image/undercrown-10-corona-viva?v=existing', quality:8 },
    'ashton-vsg-enchantment':{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:15, imageUrl:'', quality:8 }
  });

  for (const key of [H99,NICA,PAPAS,NASTY,CORONA]) entries[key] = { taster:true, rank:cards[key].rank, price:30 };
  entries[ACID] = { taster:false, rank:1, price:14.8 };

  return {
    version:3,
    cards,
    entries,
    sections:{
      recommendationSubsections:[
        { id:'coronets-cigarillos', title:'Coronets', entryKeys:[ACID, ...coronets] },
        { id:'petit-panatelas', title:'Petit', entryKeys:[...petit, 'ashton-vsg-enchantment'] },
        { id:'flavoured-infused', title:'Flavoured', entryKeys:[] }
      ],
      legendHtml:'do not touch'
    }
  };
}

test('recovered evidence restores H99 Papas, Nasty Fritas and Undercrown 10 Corona Viva to Petit positions 10, 11 and 13', () => {
  assert.deepEqual(PETIT_REPAIRS, [
    { key:H99, rank:10 },
    { key:NASTY, rank:11 },
    { key:CORONA, rank:13 }
  ]);
  const repaired = applyVerifiedPlacementImageRepair(fixture(), { verifiedImageKeys:[H99,NASTY,CORONA,ACID] });
  const petit = repaired.sections.recommendationSubsections.find(section => section.id === 'petit-panatelas');
  assert.equal(petit.entryKeys[9], H99);
  assert.equal(petit.entryKeys[10], NASTY);
  assert.equal(petit.entryKeys[12], CORONA);
  for (const { key, rank } of PETIT_REPAIRS) {
    assert.equal(repaired.cards[key].catalogueType, 'main', key);
    assert.equal(repaired.cards[key].taster, false, key);
    assert.equal(repaired.cards[key].subsection, 'petit-panatelas', key);
    assert.equal(repaired.cards[key].rank, rank, key);
    assert.equal(repaired.entries[key].taster, false, `${key} entry`);
    assert.equal(repaired.entries[key].rank, rank, `${key} entry`);
  }
});

test('Nica Rustica and Unico Papas Fritas remain Tasters and compact to recovered ranks 6 and 7', () => {
  assert.deepEqual(TASTER_REPAIRS, [
    { key:NICA, rank:6 },
    { key:PAPAS, rank:7 }
  ]);
  const repaired = applyVerifiedPlacementImageRepair(fixture(), { verifiedImageKeys:[] });
  for (const { key, rank } of TASTER_REPAIRS) {
    assert.equal(repaired.cards[key].catalogueType, 'taster', key);
    assert.equal(repaired.cards[key].taster, true, key);
    assert.equal(repaired.cards[key].rank, rank, key);
    assert.equal('subsection' in repaired.cards[key], false, key);
    assert.equal(repaired.entries[key].taster, true, `${key} entry`);
    assert.equal(repaired.entries[key].rank, rank, `${key} entry`);
  }
});

test('ACID Krush Red Cameroon is restored to the appended Coronet position 20 rather than reconstruction rank 1', () => {
  assert.deepEqual(ACID_REPAIR, { key:ACID, subsection:'coronets-cigarillos', rank:20 });
  const repaired = applyVerifiedPlacementImageRepair(fixture(), { verifiedImageKeys:[ACID] });
  const coronets = repaired.sections.recommendationSubsections.find(section => section.id === 'coronets-cigarillos');
  assert.equal(coronets.entryKeys.length, 20);
  assert.equal(coronets.entryKeys[19], ACID);
  assert.equal(repaired.cards[ACID].rank, 20);
  assert.equal(repaired.cards[ACID].subsection, 'coronets-cigarillos');
  assert.equal(repaired.entries[ACID].rank, 20);
});

test('ACID repair has a recoverable product-image source and writes the dedicated image reference only after image verification', () => {
  assert.match(ACID_IMAGE_SOURCE_URL, /^https:\/\//);
  assert.ok(VERIFIED_IMAGE_KEYS.includes(ACID));
  const withoutImage = applyVerifiedPlacementImageRepair(fixture(), { verifiedImageKeys:[] });
  assert.equal(withoutImage.cards[ACID].imageUrl, '');
  const withImage = applyVerifiedPlacementImageRepair(fixture(), { verifiedImageKeys:[ACID] });
  assert.equal(withImage.cards[ACID].imageUrl, '/api/catalogue-image/drew-estate-acid-krush-red-cameroon?v=recovery-20260918');
});

test('read-back verification accepts the recovered Worker contract and preserves unrelated catalogue content', () => {
  const before = fixture();
  const snapshot = clone(before);
  const repaired = applyVerifiedPlacementImageRepair(before, { verifiedImageKeys:[ACID,H99,NASTY,CORONA] });
  assert.deepEqual(before, snapshot, 'input state must not be mutated');
  assert.doesNotThrow(() => assertRepair(repaired, [ACID,H99,NASTY,CORONA]));
  assert.equal(repaired.sections.legendHtml, 'do not touch');
  assert.equal(repaired.cards['coronet-01'].eyebrow, 'coronet-01');
  assert.equal(repaired.cards[ACID].flavour, 8);
});
