import test from 'node:test';
import assert from 'node:assert/strict';
import {
  replayRequestDocuments,
  buildPreSidebarRepair
} from '../scripts/repair-pre-sidebar-live-state.mjs';

test('request replay keeps the latest published field values per key', () => {
  const ledger = replayRequestDocuments([
    { request:{ operation:'upsert-entry', key:'x', entry:{
      productionLines:['Handmade in Nicaragua','Wrapper: A','Binder: B','Filler: C'],
      retailerLinks:['https://old.example/x']
    }}},
    { request:{ operation:'upsert-entry', key:'x', entry:{
      retailerLinks:['https://new.example/x','https://second.example/x']
    }}}
  ]);
  assert.deepEqual(ledger.get('x').productionLines, ['Handmade in Nicaragua','Wrapper: A','Binder: B','Filler: C']);
  assert.deepEqual(ledger.get('x').retailerLinks, ['https://new.example/x','https://second.example/x']);
});

test('repair restores request-ledger Production, Practical and retailers without touching rank, image or sections', () => {
  const current = {
    version:3,
    updatedAt:'now',
    sections:{
      recommendationSubsections:[{
        id:'petit-panatelas', title:'Panatelas, Coronas & Robustos', entryKeys:['x']
      }]
    },
    cards:{
      x:{
        rank:4,
        catalogueType:'main',
        imageUrl:'/api/catalogue-image/x?v=123',
        productionLines:['Handmade','Wrapper: OLD'],
        practicalLines:['Single cigar'],
        retailerLinks:['https://wrong.example/x'],
        futureCardField:{ keep:true }
      }
    },
    entries:{
      x:{
        key:'x',
        brand:'Brand',
        title:'Example Corona',
        packageLabel:'single cigar',
        length:5,
        ring:44,
        rank:4,
        productionLines:['Handmade','Wrapper: OLD'],
        practicalLines:['Single cigar'],
        retailerLinks:['https://wrong.example/x'],
        imageUrl:'/api/catalogue-image/x?v=123'
      }
    }
  };
  const seed = { cards:{}, entries:{}, sections:{} };
  const ledger = new Map([['x',{
    productionLines:['Unflavoured','Handmade in Nicaragua','Wrapper: New Wrapper','Binder: New Binder','Filler: New Filler'],
    practicalLines:['Single cigar','Uncut','Protected','Box-pressed construction','Compact format','Slow Cadence'],
    retailerLinks:['https://www.smokingpipes.com/example/x','https://www.cigarhut.com.au/x/']
  }]]);

  const { state, changes } = buildPreSidebarRepair(current, seed, ledger);

  assert.deepEqual(state.entries.x.productionLines, [
    'Handmade','Wrapper: New Wrapper','Binder: New Binder','Filler: New Filler'
  ]);
  assert.deepEqual(state.entries.x.practicalLines, [
    'Single cigar','Uncut','Protected','Box-pressed construction','Compact format','Slow Cadence'
  ]);
  assert.deepEqual(state.entries.x.retailerLinks, [
    'https://www.smokingpipes.com/example/x','https://www.cigarhut.com.au/x/'
  ]);
  assert.deepEqual(state.cards.x.retailerLinks, state.entries.x.retailerLinks);
  assert.equal(state.cards.x.rank, 4);
  assert.equal(state.entries.x.rank, 4);
  assert.equal(state.cards.x.imageUrl, '/api/catalogue-image/x?v=123');
  assert.deepEqual(state.cards.x.futureCardField, { keep:true });
  assert.equal(state.sections.recommendationSubsections[0].title, 'Panatelas, Coronas & Robustos');
  assert.ok(changes.some(change => change.field === 'entry.productionLines'));
  assert.ok(changes.some(change => change.field === 'entry.practicalLines'));
  assert.ok(changes.some(change => change.field === 'entry.retailerLinks'));
});

test('repair uses seed data only when live/request data is missing and preserves unrelated live retailer data otherwise', () => {
  const current = {
    sections:{ recommendationSubsections:[{ id:'coronets-cigarillos', entryKeys:['static','live'] }] },
    cards:{
      static:{ rank:1, catalogueType:'main' },
      live:{
        rank:2,
        catalogueType:'main',
        retailerLinks:['https://live.example/item'],
        productionLines:['Unflavoured','Machine-made','Wrapper: Live','Binder: Live','Filler: Live'],
        practicalLines:['Tin of 10','Uncut','Protected','Lenient Cadence']
      }
    },
    entries:{}
  };
  const seed = {
    cards:{
      static:{
        productionLines:['Unflavoured','Machine-made','Wrapper: Seed','Binder: Seed','Filler: Seed'],
        practicalLines:['Tin of 10','Uncut','Protected','Lenient Cadence'],
        retailerLinks:['https://seed.example/item']
      }
    },
    entries:{},
    sections:{}
  };
  const { state } = buildPreSidebarRepair(current, seed, new Map());
  assert.deepEqual(state.cards.static.retailerLinks, ['https://seed.example/item']);
  assert.deepEqual(state.cards.live.retailerLinks, ['https://live.example/item']);
  assert.deepEqual(state.cards.static.productionLines, ['Unflavoured','Machine-made','Wrapper: Seed','Binder: Seed','Filler: Seed']);
});
