import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreSidebarState } from '../scripts/restore-pre-sidebar-arturito.mjs';

const acidEntry = {
  brand:'Drew Estate',
  title:'ACID Krush Red Cameroon',
  eyebrow:'Sweet-tea infused Cameroon Coronet',
  packagePrice:14.8,
  packageLabel:'single cigar',
  price:14.8,
  country:'Nicaragua',
  length:4,
  ring:32,
  strength:5,
  quality:7,
  flavour:8,
  risk:1,
  stock:'in',
  subsection:'coronets-cigarillos',
  taster:false,
  catalogueType:'main',
  archived:false,
  size:'gold',
  productionLines:['Flavoured','Handmade','Wrapper: Cameroon','Binder: Nicaraguan','Filler: Nicaraguan'],
  practicalLines:['Single cigar','Uncut','Fragile','Lenient Cadence'],
  smokeTime:'About 15–25 min smoke',
  retailerLinks:['https://firmincigars.com.au/product-tag/drew-estate-cigars/?v=2c18c36508d1','https://www.cigarhut.com.au/acid-krush-red-cameroon/'],
  priceChecked:'2026-09-16',
  stockChecked:'2026-09-16'
};

test('pre-sidebar Arturito restore rebuilds the known-good fingerprint without sidebar state', () => {
  const current = {
    version:3,
    updatedAt:'2026-09-17T15:00:00.000Z',
    cards:{
      'arturo-fuente-exquisitos-maduro': { title:'Exquisitos Maduro', value:'bronze', rank:10 },
      existing: { title:'Keep me', value:'gold' }
    },
    entries:{
      'arturo-fuente-exquisitos-maduro': { key:'arturo-fuente-exquisitos-maduro', brand:'Arturo Fuente', title:'Exquisitos Maduro', rank:10 },
      existing: { key:'existing', brand:'Example', title:'Keep me' }
    },
    sections:{
      recommendationSubsections:[
        { id:'coronets-cigarillos', entryKeys:['existing'] },
        { id:'petit-panatelas', entryKeys:[] },
        { id:'flavoured-infused', entryKeys:[] }
      ],
      brandLogos:{ davidoff:{ size:32 } },
      hiddenBrands:['Example']
    }
  };

  const restored = buildPreSidebarState({ current, acidEntry });

  assert.equal(restored.sections.brandLogos, undefined);
  assert.equal(restored.sections.hiddenBrands, undefined);
  assert.match(restored.entries['arturo-fuente-exquisitos-maduro'].title, /Arturito/i);
  assert.match(restored.cards['arturo-fuente-exquisitos-maduro'].title, /Arturito/i);
  assert.equal(restored.entries['drew-estate-acid-krush-red-cameroon'].title, 'ACID Krush Red Cameroon');
  assert.equal(restored.cards['drew-estate-acid-krush-red-cameroon'].catalogueType, 'main');
  assert.equal(restored.sections.recommendationSubsections[0].entryKeys[0], 'drew-estate-acid-krush-red-cameroon');
  assert.equal(restored.cards.existing.value, undefined);
  assert.equal(restored.updatedAt, undefined);
});
