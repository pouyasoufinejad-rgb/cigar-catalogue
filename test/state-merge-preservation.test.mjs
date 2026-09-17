import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeState } from '../src/index.js';

test('sections-only writes preserve existing entries byte-for-byte, including future fields', () => {
  const existing = {
    version:3,
    updatedAt:'2026-09-17T06:00:00.000Z',
    cards:{
      'example-card': {
        summaryHtml:'<strong>Current copy</strong>',
        futureCardField:{ keep:true },
        imageUrl:'/api/catalogue-image/example-card?v=111'
      }
    },
    sections:{ oldSection:{ enabled:true } },
    entries:{
      'example-entry': {
        key:'example-entry',
        brand:'Example',
        title:'Current title',
        rank:7,
        catalogueType:'Half-Cigar',
        archivedRank:12,
        futureEntryField:{ nested:['must','survive'] },
        imageUrl:'/api/catalogue-image/example-entry?v=222',
        imageSourceKey:'example-entry',
        imageVersion:222
      }
    }
  };

  const merged = mergeState(existing, {
    sections:{ ...existing.sections, brandLogos:{ davidoff:{ size:32, x:1, y:-2 } } }
  });

  assert.deepEqual(merged.entries, existing.entries);
  assert.deepEqual(merged.cards, existing.cards);
  assert.deepEqual(merged.sections.brandLogos, { davidoff:{ size:32, x:1, y:-2 } });
});

test('cards-only writes preserve existing entries and sections untouched', () => {
  const existing = {
    version:3,
    cards:{ old:{ futureCardField:'keep' } },
    sections:{ recommendationSubsections:{ order:['a','b'] }, futureSectionField:{ keep:true } },
    entries:{
      cigar:{
        key:'cigar',
        brand:'Brand',
        title:'Latest version',
        catalogueType:'Half-Cigar',
        archivedRank:4,
        futureEntryField:'keep-me',
        imageUrl:'/api/catalogue-image/cigar?v=987'
      }
    }
  };

  const merged = mergeState(existing, { cards:{ old:{ summaryHtml:'<strong>Updated</strong>' } } });

  assert.deepEqual(merged.entries, existing.entries);
  assert.deepEqual(merged.sections, existing.sections);
  assert.equal(merged.cards.old.summaryHtml, '<strong>Updated</strong>');
});
