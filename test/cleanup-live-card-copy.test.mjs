import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCatalogueText,
  cleanCatalogueTitle,
  cleanSummaryMeta,
  buildCleanupPatch,
  buildCleanupPreview,
  findAffectedKeys
} from '../scripts/cleanup-live-card-copy.mjs';

test('removes projected markers without changing the substantive tag', () => {
  assert.equal(cleanCatalogueText('Nicotine: High (projected)'), 'Nicotine: High');
  assert.equal(cleanCatalogueText('25–35 min smoke (projected)'), '25–35 min smoke');
});

test('removes untasted/projection status filler while preserving useful prose, when asked', () => {
  const input = '<strong>Dark tobacco, espresso and cocoa</strong> are the projected centre of this compact blend. AJ Fernandez specifies a dark Nicaraguan wrapper. It remains untasted, so the intensity, finish and pairing calls are projections rather than palate-confirmed claims.';
  assert.equal(
    cleanCatalogueText(input),
    '<strong>Dark tobacco, espresso and cocoa</strong> are the centre of this compact blend. AJ Fernandez specifies a dark Nicaraguan wrapper.'
  );
});

test('preserves the useful first half of a sentence before an untasted disclaimer', () => {
  const input = 'The flavour combination is much closer to the sweet profile this catalogue tends to reward, but it remains untasted here, so Strength 5 and Quality 6 are projections and Flavour stays unrated.';
  assert.equal(
    cleanCatalogueText(input),
    'The flavour combination is much closer to the sweet profile this catalogue tends to reward.'
  );
});

test('cleans notes and eyebrow text rather than deleting useful facts, when asked', () => {
  assert.equal(
    cleanCatalogueText('Untasted projection. Exact-vitola reviews have repeatedly landed around 88–90 points.'),
    'Exact-vitola reviews have repeatedly landed around 88–90 points.'
  );
  assert.equal(
    cleanCatalogueText('No. 5 — Untasted; premium full-bodied Nicaraguan tin', { stripUntasted: true }),
    'No. 5 — premium full-bodied Nicaraguan tin'
  );
});

test('removes catalogue-placement commentary from summaries while keeping cigar prose', () => {
  const input = '<strong>Cocoa, cedar and pepper</strong> lead a dense savoury profile. Its No. 7 placement keeps it above the lighter cigars in the catalogue. The finish turns sweeter with espresso and leather.';
  assert.equal(
    cleanSummaryMeta(input),
    '<strong>Cocoa, cedar and pepper</strong> lead a dense savoury profile. The finish turns sweeter with espresso and leather.'
  );
});

test('preserves third-party ranking facts that are about the cigar rather than catalogue placement', () => {
  const input = 'Cigar Aficionado ranked the exact vitola No. 3 in its 2025 Top 25.';
  assert.equal(cleanSummaryMeta(input), input);
});

test('removes short-form self-referential rank sentences from summaries', () => {
  assert.equal(
    cleanSummaryMeta('Dense cocoa and coffee dominate. That puts it at No. 4. Pepper builds through the finish.'),
    'Dense cocoa and coffee dominate. Pepper builds through the finish.'
  );
});

test('buildCleanupPatch only returns visible fields whose current effective value changes', () => {
  const entry = {
    eyebrow: 'Dark Broadleaf cigar',
    summaryHtml: '<strong>Cocoa</strong> and pepper.',
    noteHtml: 'Untasted. The Index lists the single at A$30.',
    smokeTime: '30–40 min smoke (projected)',
    experienceTags: ['Nicotine: High (projected)', 'Occasion: Evening smoke'],
    rank: 8,
    price: 30
  };
  const card = {
    summaryHtml: '<strong>Cocoa</strong> and pepper with a sweeter finish.'
  };
  assert.deepEqual(buildCleanupPatch(card, entry, {}, { stripUntasted: true }), {
    noteHtml: 'The Index lists the single at A$30.',
    smokeTime: '30–40 min smoke',
    experienceTags: ['Nicotine: High', 'Occasion: Evening smoke']
  });
});

test('buildCleanupPatch includes meta-summary cleanup without touching rank fields', () => {
  const entry = {
    summaryHtml: 'Earth and cocoa lead. It currently sits at No. 9 in the catalogue.',
    rank: 9,
    price: 33
  };
  assert.deepEqual(buildCleanupPatch({}, entry), {
    summaryHtml: 'Earth and cocoa lead.'
  });
});

test('findAffectedKeys scans the current effective live copy across cards and dynamic entries', () => {
  const state = {
    cards: {
      tasted: { summaryHtml: 'Clean current tasting prose.' },
      staticOld: { eyebrow: 'Untasted; premium compact cigar' }
    },
    entries: {
      tasted: { summaryHtml: 'Old projected copy should not override the current card.' },
      dynamicOld: { smokeTime: '30 min smoke (projected)' },
      metaOld: { summaryHtml: 'Dark cocoa and pepper. It sits at No. 12 in the catalogue.' },
      clean: { noteHtml: 'Current retailer price A$30.' }
    }
  };
  assert.deepEqual(findAffectedKeys(state, {}, { stripUntasted: true }), ['dynamicOld', 'metaOld', 'staticOld']);
  // By default an untasted-only field is left alone, so that card is not swept.
  assert.deepEqual(findAffectedKeys(state), ['dynamicOld', 'metaOld']);
});

test('a title never repeats the package when the package is a single', () => {
  assert.equal(cleanCatalogueTitle('Undercrown 10 Corona Viva — Single'), 'Undercrown 10 Corona Viva');
  assert.equal(cleanCatalogueTitle('Único Serie L40 Lancero — Single'), 'Único Serie L40 Lancero');
  assert.equal(cleanCatalogueTitle('Short — Single'), 'Short');
  assert.equal(cleanCatalogueTitle('Escurio Petit Robusto — Single cigar'), 'Escurio Petit Robusto');
});

test('a title keeps a package that is not a single, and an unaffected title is untouched', () => {
  const tin = 'Liga Privada No. 9 Coronets — Tin of 10';
  assert.equal(cleanCatalogueTitle(tin), tin);
  const plain = 'The Wise Man Maduro Lancero';
  assert.equal(cleanCatalogueTitle(plain), plain);
  // A hyphenated vitola must not be mistaken for the package separator.
  assert.equal(cleanCatalogueTitle('Disciple Half-Corona — Single'), 'Disciple Half-Corona');
});

test('the title rule runs as part of the card patch alongside the projected rule', () => {
  const patch = buildCleanupPatch({}, {
    title: 'New World Cameroon Short Robusto — Single',
    smokeTime: '40–55 min smoke (projected)',
    experienceTags: ['Nicotine: Medium (projected)']
  }, {});
  assert.equal(patch.title, 'New World Cameroon Short Robusto');
  assert.equal(patch.smokeTime, '40–55 min smoke');
  assert.deepEqual(patch.experienceTags, ['Nicotine: Medium']);
});

test('preview reports every field it would rewrite and writes nothing', () => {
  const state = {
    cards: {},
    entries: {
      x: { key:'x', title:'Example Corona — Single', smokeTime:'30 min smoke (projected)' }
    }
  };
  const preview = buildCleanupPreview(state, { cards:{} });
  assert.equal(preview.length, 1);
  assert.equal(preview[0].key, 'x');
  const byField = Object.fromEntries(preview[0].fields.map(f => [f.field, f]));
  assert.equal(byField.title.before, 'Example Corona — Single');
  assert.equal(byField.title.after, 'Example Corona');
  assert.equal(byField.smokeTime.after, '30 min smoke');
});

test('untasted status survives a default sweep and only projection wording is removed', () => {
  assert.equal(cleanCatalogueText('Untasted.'), 'Untasted.');
  assert.equal(
    cleanCatalogueText('Untasted. The Index lists the single at A$30.'),
    'Untasted. The Index lists the single at A$30.'
  );
  // A sentence carrying both still goes, because it carries the projection wording.
  assert.equal(
    cleanCatalogueText('Untasted projection. The Index lists it at A$13.'),
    'The Index lists it at A$13.'
  );
  assert.equal(
    cleanCatalogueText('Rich and dark. Untasted here, so Strength 8 and Quality 8 remain projections and Flavour stays unrated.'),
    'Rich and dark.'
  );
  assert.equal(cleanCatalogueText('Untasted.', { stripUntasted: true }), '');
});

test('a factual sentence is not mistaken for catalogue-placement commentary', () => {
  // "sits" next to the word catalogue used to be enough to delete this whole sentence.
  const input = "Its 5″ × 44 Chiselito shape sits in a comfortable ring gauge but makes this a longer, more serious session than the catalogue's compact tins.";
  assert.equal(cleanSummaryMeta(input), input);
  // A real placement statement is still removed.
  assert.equal(
    cleanSummaryMeta('Dense cocoa leads. It currently sits at No. 9 in the catalogue.'),
    'Dense cocoa leads.'
  );
});

test('a stray editing bullet is stripped from a title', () => {
  assert.equal(cleanCatalogueTitle('*  Maduro Gran Corona — Single'), 'Maduro Gran Corona');
  assert.equal(cleanCatalogueTitle('* Serie V Melanio'), 'Serie V Melanio');
});
