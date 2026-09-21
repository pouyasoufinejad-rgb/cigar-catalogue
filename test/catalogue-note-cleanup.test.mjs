import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanupStaleCatalogueNotes,
  isStaleMarkupNote,
  validateRequest
} from '../scripts/publish-catalogue-request.mjs';

test('stale markup-note detection targets tasting status and shopping-only copy', () => {
  assert.equal(isStaleMarkupNote('Untasted. The Index lists it at A$30.'), true);
  assert.equal(isStaleMarkupNote('Taster available: Example cigar — A$29 single.'), true);
  assert.equal(isStaleMarkupNote('Cigar Hut currently lists the exact single at A$34 and available.'), true);
  assert.equal(isStaleMarkupNote('Tasted halfway. Tight draw, strong pepper and a slightly uneven burn.'), false);
});

test('cleanup replaces stale parent and nested variant notes without touching unrelated fields', () => {
  const input = {
    version: 3,
    sections: { keep: true },
    cards: {
      static: {
        rank: 1,
        summaryHtml: '<strong>Cocoa and espresso</strong> lead the profile. The Broadleaf wrapper keeps it dark and rich. Untasted here, so ratings are provisional.',
        noteHtml: 'Exact-line taster available: A$30 single.',
        retailerLinks: ['https://example.com']
      }
    },
    entries: {
      dynamic: {
        key: 'dynamic', brand: 'Example', title: 'Example Cigar', rank: 2,
        summaryHtml: 'Cedar and pepper lead. The chisel shape concentrates the opening.',
        noteHtml: 'Untasted.',
        price: 25,
        blendVariants: [{ id: 'natural', label: 'Natural', summaryHtml: 'Cream and cedar lead. The Cameroon wrapper keeps it aromatic.', noteHtml: 'Untasted.' }]
      }
    }
  };
  const cleaned = cleanupStaleCatalogueNotes(input);
  assert.equal(cleaned.noteChanges, 3);
  assert.equal(cleaned.summaryChanges, 1);
  assert.equal(cleaned.state.cards.static.rank, 1);
  assert.deepEqual(cleaned.state.cards.static.retailerLinks, ['https://example.com']);
  assert.equal(cleaned.state.entries.dynamic.price, 25);
  assert.doesNotMatch(cleaned.state.cards.static.noteHtml, /A\$|Untasted/i);
  assert.doesNotMatch(cleaned.state.cards.static.summaryHtml, /Untasted/i);
  assert.match(cleaned.state.entries.dynamic.noteHtml, /chisel shape/i);
  assert.match(cleaned.state.entries.dynamic.blendVariants[0].noteHtml, /Cameroon wrapper/i);
});

test('future upserts reject redundant untasted copy, including nested variants', () => {
  assert.throws(() => validateRequest({
    operation: 'upsert-entry', key: 'example', entry: { noteHtml: 'Untasted.' }
  }), /must not use "untasted"/i);
  assert.throws(() => validateRequest({
    operation: 'upsert-entry', key: 'example', entry: { blendVariants: [{ id: 'natural', label: 'Natural', summaryHtml: 'Untasted here.' }] }
  }), /must not use "untasted"/i);
  assert.equal(validateRequest({ operation: 'cleanup-notes' }).operation, 'cleanup-notes');
});
