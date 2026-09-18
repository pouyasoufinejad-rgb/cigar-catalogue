import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVerifiedPlacementImageRepair,
  assertRepair,
  TASTER_REPAIRS,
  PETIT_REPAIRS,
  CHISELITO_REPAIR,
  ISLA_REPAIR,
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
const CHISELITO = 'la-flor-dominicana-double-ligero-chiselito-maduro';
const ISLA = 'isla-del-sol-maduro-coronets';
const KFC_SWEETS = 'kfc-ponies-sweets';

function numbered(prefix, count) {
  return Array.from({ length:count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`);
}

function fixture() {
  const coronets = numbered('coronet', 19);
  const petitHead = numbered('petit-head', 8);
  const petitTail = numbered('petit-tail', 4);
  const taster = numbered('taster', 5);
  const cards = {};
  const entries = {};

  coronets.forEach((key, index) => { cards[key] = { catalogueType:'main', taster:false, subsection:'coronets-cigarillos', rank:index + 1, eyebrow:key }; });
  petitHead.forEach((key, index) => { cards[key] = { catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:index + 1, eyebrow:key }; });
  petitTail.forEach((key, index) => { cards[key] = { catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:index + 12, eyebrow:key }; });
  taster.forEach((key, index) => { cards[key] = { catalogueType:'taster', taster:true, rank:index + 1, eyebrow:key }; });

  Object.assign(cards, {
    [ACID]:{ catalogueType:'main', taster:false, subsection:'coronets-cigarillos', rank:20, imageUrl:'/api/catalogue-image/drew-estate-acid-krush-red-cameroon?v=existing', flavour:8, eyebrow:'Sweet-tea infused Cameroon Coronet' },
    [CHISELITO]:{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:9, imageUrl:'/api/catalogue-image/la-flor-dominicana-double-ligero-chiselito-maduro?v=existing', quality:9, eyebrow:'Elite full-bodied masterpiece' },
    [H99]:{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:10, imageUrl:'/api/catalogue-image/liga-privada-h99-papas-fritas?v=existing', quality:8 },
    [NASTY]:{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:11, imageUrl:'/api/catalogue-image/liga-privada-unico-nasty-fritas?v=existing', quality:8 },
    [CORONA]:{ catalogueType:'main', taster:false, subsection:'petit-panatelas', rank:13, imageUrl:'/api/catalogue-image/undercrown-10-corona-viva?v=existing', quality:8 },
    [NICA]:{ catalogueType:'taster', taster:true, rank:6, quality:7 },
    [PAPAS]:{ catalogueType:'taster', taster:true, rank:7, quality:8 },
    [KFC_SWEETS]:{ catalogueType:'main', taster:false, subsection:'flavoured-infused', rank:1 },
    [ISLA]:{ catalogueType:'main', taster:false, subsection:'flavoured-infused', rank:2, imageUrl:'/api/catalogue-image/isla-del-sol-maduro-coronets?v=existing' }
  });

  entries[ACID] = { taster:false, rank:20, price:14.8 };
  entries[CHISELITO] = { taster:false, rank:9, price:36.2 };
  for (const key of [H99,NASTY,CORONA]) entries[key] = { taster:false, rank:cards[key].rank, price:30 };
  for (const key of [NICA,PAPAS]) entries[key] = { taster:true, rank:cards[key].rank, price:30 };
  entries[ISLA] = { taster:false, rank:2, price:12 };

  return {
    version:3,
    cards,
    entries,
    sections:{
      recommendationSubsections:[
        { id:'coronets-cigarillos', title:'Coronets', entryKeys:[...coronets, ACID] },
        {
          id:'petit-panatelas',
          title:'Petit',
          entryKeys:[
            ...petitHead,
            CHISELITO,
            H99,
            NASTY,
            petitTail[0],
            CORONA,
            petitTail[1],
            petitTail[2],
            petitTail[3]
          ]
        },
        { id:'flavoured-infused', title:'Flavoured', entryKeys:[KFC_SWEETS, ISLA] }
      ],
      legendHtml:'do not touch'
    }
  };
}

test('historical checkpoint correction restores Chiselito to Petit rank 1 without disturbing recovered later Petit anchors', () => {
  assert.deepEqual(CHISELITO_REPAIR, { key:CHISELITO, subsection:'petit-panatelas', rank:1 });
  const repaired = applyVerifiedPlacementImageRepair(fixture(), { verifiedImageKeys:[H99,NASTY,CORONA,ACID,ISLA] });
  const petit = repaired.sections.recommendationSubsections.find(section => section.id === 'petit-panatelas');

  assert.equal(petit.entryKeys[0], CHISELITO);
  assert.equal(repaired.cards[CHISELITO].rank, 1);
  assert.equal(repaired.cards[CHISELITO].subsection, 'petit-panatelas');
  assert.equal(repaired.entries[CHISELITO].rank, 1);

  assert.equal(petit.entryKeys[9], H99);
  assert.equal(petit.entryKeys[10], NASTY);
  assert.equal(petit.entryKeys[12], CORONA);
  assert.equal(repaired.cards[H99].rank, 10);
  assert.equal(repaired.cards[NASTY].rank, 11);
  assert.equal(repaired.cards[CORONA].rank, 13);
});

test('Isla del Sol Maduro Coronets remains in Flavoured & Infused at the verified later rank 2', () => {
  assert.deepEqual(ISLA_REPAIR, { key:ISLA, subsection:'flavoured-infused', rank:2 });
  const repaired = applyVerifiedPlacementImageRepair(fixture(), { verifiedImageKeys:[ISLA] });
  const flavoured = repaired.sections.recommendationSubsections.find(section => section.id === 'flavoured-infused');
  assert.equal(flavoured.entryKeys[1], ISLA);
  assert.equal(repaired.cards[ISLA].catalogueType, 'main');
  assert.equal(repaired.cards[ISLA].taster, false);
  assert.equal(repaired.cards[ISLA].subsection, 'flavoured-infused');
  assert.equal(repaired.cards[ISLA].rank, 2);
  assert.equal(repaired.entries[ISLA].rank, 2);
});

test('recovered later edits keep H99 Papas, Nasty Fritas and Undercrown 10 Corona Viva at Petit positions 10, 11 and 13', () => {
  assert.deepEqual(PETIT_REPAIRS, [
    { key:H99, rank:10 },
    { key:NASTY, rank:11 },
    { key:CORONA, rank:13 }
  ]);
  const repaired = applyVerifiedPlacementImageRepair(fixture(), { verifiedImageKeys:[H99,NASTY,CORONA,ACID] });
  const petit = repaired.sections.recommendationSubsections.find(section => section.id === 'petit-panatelas');
  for (const { key, rank } of PETIT_REPAIRS) {
    assert.equal(petit.entryKeys[rank - 1], key);
    assert.equal(repaired.cards[key].catalogueType, 'main', key);
    assert.equal(repaired.cards[key].taster, false, key);
    assert.equal(repaired.cards[key].subsection, 'petit-panatelas', key);
    assert.equal(repaired.cards[key].rank, rank, key);
    assert.equal(repaired.entries[key].taster, false, `${key} entry`);
    assert.equal(repaired.entries[key].rank, rank, `${key} entry`);
  }
});

test('Nica Rustica and Unico Papas Fritas remain Tasters at recovered ranks 6 and 7', () => {
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

test('ACID Krush Red Cameroon remains at appended Coronet position 20', () => {
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
  const damaged = fixture();
  damaged.cards[ACID].imageUrl = '';
  const withoutImage = applyVerifiedPlacementImageRepair(damaged, { verifiedImageKeys:[] });
  assert.equal(withoutImage.cards[ACID].imageUrl, '');
  const withImage = applyVerifiedPlacementImageRepair(damaged, { verifiedImageKeys:[ACID] });
  assert.equal(withImage.cards[ACID].imageUrl, '/api/catalogue-image/drew-estate-acid-krush-red-cameroon?v=recovery-20260918');
});

test('read-back verification accepts the recovered Worker contract and preserves unrelated catalogue content', () => {
  const before = fixture();
  const snapshot = clone(before);
  const repaired = applyVerifiedPlacementImageRepair(before, { verifiedImageKeys:[ACID,H99,NASTY,CORONA,ISLA] });
  assert.deepEqual(before, snapshot, 'input state must not be mutated');
  assert.doesNotThrow(() => assertRepair(repaired, [ACID,H99,NASTY,CORONA,ISLA]));
  assert.equal(repaired.sections.legendHtml, 'do not touch');
  assert.equal(repaired.cards['coronet-01'].eyebrow, 'coronet-01');
  assert.equal(repaired.cards[CHISELITO].eyebrow, 'Elite full-bodied masterpiece');
  assert.equal(repaired.cards[ACID].flavour, 8);
});
