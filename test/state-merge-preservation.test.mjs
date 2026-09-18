import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeState } from '../src/index.js';

test('partial section writes preserve untouched entry/card fields byte-for-byte', () => {
  const existing = {
    version:3,
    updatedAt:'before',
    cards:{
      cigar:{
        retailerLinks:['https://example.com/a'],
        futureCardField:{ keep:true },
        productionLines:['Handmade','Wrapper: A','Binder: B','Filler: C']
      }
    },
    sections:{ old:{ keep:true } },
    entries:{
      cigar:{
        key:'cigar',
        brand:'Brand',
        title:'Title',
        retailerLinks:['https://example.com/a'],
        futureEntryField:{ keep:true },
        catalogueType:'half'
      }
    }
  };
  const merged = mergeState(existing, { sections:{ ...existing.sections, sidebar:{ compact:true } } });
  assert.deepEqual(merged.cards, existing.cards);
  assert.deepEqual(merged.entries, existing.entries);
  assert.deepEqual(merged.sections.sidebar, { compact:true });
});
