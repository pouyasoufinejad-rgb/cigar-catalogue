import test from 'node:test';
import assert from 'node:assert/strict';
import {
  noteNeedsReplacement,
  buildDistinctiveNote,
  buildMarkupNotePatch,
  parseRenderedCards,
  findAffectedKeys,
  badEffectiveRenderedNotes
} from '../scripts/cleanup-live-markup-notes.mjs';

test('untasted markup notes are always replaced', () => {
  assert.equal(noteNeedsReplacement('Untasted.'), true);
  assert.equal(noteNeedsReplacement('Untasted. The Index lists the single at A$30.'), true);
});

test('retailer and price-only notes are replaced, but a substantive cigar note survives', () => {
  assert.equal(noteNeedsReplacement('The Index currently lists the exact single at A$37.80 and Cigar Hut lists it at A$45.'), true);
  assert.equal(
    noteNeedsReplacement('Its chisel head gives an unusually comfortable draw and concentrates the opening pepper. The Index lists it at A$42.'),
    false
  );
});

test('distinctive note prefers substantive cigar-specific summary copy', () => {
  const note = buildDistinctiveNote({
    summaryHtml: '<strong>Maple sweetness, hickory smoke and oak</strong> define the Sweets blend. The sweetened cap softens the fire-cured Kentucky tobacco while keeping the smoky core intact.',
    productionLines: ['Wrapper: Mexican San Andrés', 'Filler: Kentucky fire-cured + Nicaraguan']
  });
  assert.match(note, /sweetened cap|fire-cured|Maple sweetness/i);
  assert.doesNotMatch(note, /untasted|A\$/i);
});

test('construction provides a real fallback when summary copy is absent', () => {
  assert.equal(
    buildDistinctiveNote({
      productionLines: ['Wrapper: Ecuadorian Cameroon', 'Binder: Nicaraguan', 'Filler: Nicaraguan']
    }),
    "Its Ecuadorian Cameroon wrapper over Nicaraguan filler is the blend's defining construction choice."
  );
});

test('patch rewrites parent and nested variant notes without touching unrelated fields', () => {
  const entry = {
    title: 'Example',
    rank: 5,
    price: 25,
    summaryHtml: 'A box-pressed shape and dark Broadleaf wrapper give it a dense cocoa-and-pepper profile.',
    noteHtml: 'Untasted. Cigar Hut lists it at A$25.',
    sizeVariants: [
      {
        id: 'corona',
        label: 'Corona',
        price: 25,
        noteHtml: 'The Index lists this size at A$25.'
      }
    ],
    blendVariants: [
      {
        id: 'maduro',
        label: 'Maduro',
        summaryHtml: 'The Maduro uses a dark San Andrés wrapper for more cocoa and earth.',
        noteHtml: 'Untasted.',
        sizeVariants: [
          {
            id: 'petit-corona',
            label: 'Petit Corona',
            noteHtml: 'Cigar Hut lists the single at A$29.'
          }
        ]
      }
    ]
  };
  const patch = buildMarkupNotePatch({}, entry, {});
  assert.match(patch.noteHtml, /box-pressed|Broadleaf/i);
  assert.doesNotMatch(patch.noteHtml, /untasted|Cigar Hut|A\$/i);
  assert.match(patch.sizeVariants[0].noteHtml, /box-pressed|Broadleaf/i);
  assert.match(patch.blendVariants[0].noteHtml, /San Andrés|Maduro/i);
  assert.match(patch.blendVariants[0].sizeVariants[0].noteHtml, /San Andrés|Maduro/i);
  assert.equal(patch.rank, undefined);
  assert.equal(patch.price, undefined);
});

test('rendered-card parser recovers note and descriptive context for static cards', () => {
  const html = '<article class="card" data-key="x"><div class="artframe" data-visual-length="4" data-visual-ring="46"><div class="artmeta artmeta-left"><span class="artmeta-line">Wrapper: Mexican San Andrés</span></div><div class="artmeta artmeta-right"><span class="artmeta-line">Sweetened cap</span></div></div><div class="cardbody"><div class="eyebrow">No. 4 — Sweetened fire-cured compact</div><h3><span>Drew Estate</span>KFC Sweets Chunky</h3><p class="summary"><strong>Maple and hickory</strong> lead the profile.</p><p class="mog-note">Untasted. The Index lists it at A$37.80.</p></div></article>';
  const parsed = parseRenderedCards(html);
  assert.equal(parsed.x.brand, 'Drew Estate');
  assert.equal(parsed.x.title, 'KFC Sweets Chunky');
  assert.equal(parsed.x.length, 4);
  assert.equal(parsed.x.ring, 46);
  assert.equal(parsed.x.productionLines[0], 'Wrapper: Mexican San Andrés');
  assert.match(parsed.x.noteHtml, /Untasted/);
});

test('findAffectedKeys scans cards, entries and nested variants', () => {
  const state = {
    cards: {
      staticBad: {
        summaryHtml: 'A chisel shape makes this format distinctive.',
        noteHtml: 'Untasted.'
      }
    },
    entries: {
      dynamicBad: {
        summaryHtml: 'Fire-cured Kentucky tobacco gives a smoky barbecue profile.',
        noteHtml: 'The Index lists it at A$20.'
      },
      variantBad: {
        summaryHtml: 'Dark Broadleaf and pepper define the blend.',
        noteHtml: 'Already useful: Broadleaf gives the smoke a dark cocoa core.',
        sizeVariants: [{ id: 'short', label: 'Short', noteHtml: 'Cigar Hut lists this at A$18.' }]
      },
      clean: {
        noteHtml: 'The chisel head changes how the smoke concentrates at the cap.'
      }
    }
  };
  assert.deepEqual(findAffectedKeys(state, {}), ['dynamicBad', 'staticBad', 'variantBad']);
});

test('render verification uses the KV editorial override over stale legacy HTML', () => {
  const rendered = {
    legacy: {
      summaryHtml: 'Dark Broadleaf and cocoa define the blend.',
      noteHtml: 'Untasted. The Index lists it at A$22.'
    }
  };
  const state = {
    cards: {
      legacy: {
        noteHtml: 'Dark Broadleaf gives the compact smoke a dense cocoa core.'
      }
    },
    entries: {}
  };
  assert.deepEqual(badEffectiveRenderedNotes(state, rendered), []);
});


test('findAffectedKeys includes stale cards that exist only in rendered production', () => {
  const rendered = {
    staticOnly: {
      summaryHtml: 'Fire-cured Kentucky tobacco gives this compact cigar its smoky identity.',
      noteHtml: 'Untasted. The Index lists it at A$20.'
    }
  };
  assert.deepEqual(findAffectedKeys({ cards: {}, entries: {} }, rendered), ['staticOnly']);
});
