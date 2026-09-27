import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  catalogueRecordFromState,
  mergeCatalogueRecord
} from '../public/catalogue-state-record.mjs';

test('card overrides always win over older dynamic entry values', () => {
  const state = {
    entries: {
      nasty: {
        key:'nasty',
        title:'Nasty Fritas',
        flavourProfile:{ sweet:3, pepper:4, earth:4 },
        price:41
      }
    },
    cards: {
      nasty: {
        flavourProfile:{ sweet:3, pepper:1, earth:4 },
        price:39
      }
    }
  };
  const merged = catalogueRecordFromState(state, 'nasty');
  assert.equal(merged.price, 39);
  assert.deepEqual(merged.flavourProfile, { sweet:3, pepper:1, earth:4 });
});

test('partial blend overrides do not erase untouched variant metadata', () => {
  const entry = {
    blendVariants:[
      { id:'natural', label:'Natural' },
      {
        id:'maduro',
        label:'Maduro',
        title:'Cubanitos Maduro',
        price:12.9,
        productionLines:['Wrapper: Connecticut Broadleaf'],
        retailerLinks:['https://example.test/maduro'],
        flavourProfile:{ sweet:4, pepper:3 }
      }
    ]
  };
  const card = {
    blendVariants:[
      { id:'maduro', flavourProfile:{ sweet:4, pepper:1 } }
    ]
  };
  const merged = mergeCatalogueRecord(entry, card, 'cubanitos');
  const maduro = merged.blendVariants.find(item => item.id === 'maduro');
  assert.equal(maduro.title, 'Cubanitos Maduro');
  assert.equal(maduro.price, 12.9);
  assert.deepEqual(maduro.productionLines, ['Wrapper: Connecticut Broadleaf']);
  assert.deepEqual(maduro.retailerLinks, ['https://example.test/maduro']);
  assert.deepEqual(maduro.flavourProfile, { sweet:4, pepper:1 });
  assert.equal(merged.blendVariants.find(item => item.id === 'natural').label, 'Natural');
});

test('partial nested size overrides preserve the rest of the blend and vitola', () => {
  const entry = {
    blendVariants:[{
      id:'maduro',
      label:'Maduro',
      title:'Maduro parent',
      sizeVariants:[
        { id:'robusto', label:'Robusto', price:40, ring:50, summaryHtml:'base robusto' },
        { id:'toro', label:'Toro', price:45, ring:52, summaryHtml:'base toro' }
      ]
    }]
  };
  const card = {
    blendVariants:[{
      id:'maduro',
      sizeVariants:[{ id:'robusto', summaryHtml:'edited robusto' }]
    }]
  };
  const merged = mergeCatalogueRecord(entry, card, 'nested');
  const maduro = merged.blendVariants[0];
  assert.equal(maduro.title, 'Maduro parent');
  assert.equal(maduro.sizeVariants[0].price, 40);
  assert.equal(maduro.sizeVariants[0].ring, 50);
  assert.equal(maduro.sizeVariants[0].summaryHtml, 'edited robusto');
  assert.equal(maduro.sizeVariants[1].summaryHtml, 'base toro');
});

test('an explicit empty override list can intentionally remove variants', () => {
  const merged = mergeCatalogueRecord(
    { sizeVariants:[{ id:'one', label:'One' }] },
    { sizeVariants:[] },
    'clear'
  );
  assert.deepEqual(merged.sizeVariants, []);
});

test('all interactive edit readers share the same card-over-entry state layering', async () => {
  const modules = [
    '../public/catalogue-admin-unified-v139.mjs',
    '../public/catalogue-flavour.mjs',
    '../public/catalogue-variant-editor.mjs',
    '../public/catalogue-variant-runtime.mjs',
    '../public/catalogue-direct-persistence.mjs'
  ];
  for (const path of modules) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /catalogue-state-record\.mjs\?v=edit-consistency-1/, path);
  }
});

test('variant default saving uses authenticated full-state PUT rather than the broken partial POST', async () => {
  const source = await readFile(new URL('../public/catalogue-variant-runtime.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /method:\s*['\"]POST['\"]/);
  assert.match(source, /method:\s*['\"]PUT['\"]/);
  assert.match(source, /authorization:/);
  assert.match(source, /adminToken\(token\)/);
  assert.match(source, /cards,[\s\S]*sections:[\s\S]*entries/);
  assert.match(source, /did not survive read-back/);
});
