import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCatalogueText,
  buildCleanupPatch,
  findAffectedKeys
} from '../scripts/cleanup-live-card-copy.mjs';

test('removes projected markers without changing the substantive tag', () => {
  assert.equal(cleanCatalogueText('Nicotine: High (projected)'), 'Nicotine: High');
  assert.equal(cleanCatalogueText('25–35 min smoke (projected)'), '25–35 min smoke');
});

test('removes untasted/projection status filler while preserving useful prose', () => {
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

test('cleans notes and eyebrow text rather than deleting useful facts', () => {
  assert.equal(
    cleanCatalogueText('Untasted projection. Exact-vitola reviews have repeatedly landed around 88–90 points.'),
    'Exact-vitola reviews have repeatedly landed around 88–90 points.'
  );
  assert.equal(
    cleanCatalogueText('No. 5 — Untasted; premium full-bodied Nicaraguan tin'),
    'No. 5 — premium full-bodied Nicaraguan tin'
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
  assert.deepEqual(buildCleanupPatch(card, entry), {
    noteHtml: 'The Index lists the single at A$30.',
    smokeTime: '30–40 min smoke',
    experienceTags: ['Nicotine: High', 'Occasion: Evening smoke']
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
      clean: { noteHtml: 'Current retailer price A$30.' }
    }
  };
  assert.deepEqual(findAffectedKeys(state), ['dynamicOld', 'staticOld']);
});
