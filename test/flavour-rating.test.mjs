import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  countGoldRatings,
  deriveAutoLaurel,
  flavourRatingMarkup,
  injectFlavourIntoStatePayload,
  normaliseFlavour
} from '../public/catalogue-flavour.mjs';

const loaderSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const flavourSource = await readFile(new URL('../public/catalogue-flavour.mjs', import.meta.url), 'utf8');

test('Flavour is optional and remains unrated until explicitly assigned', () => {
  assert.equal(normaliseFlavour(undefined), null);
  assert.equal(normaliseFlavour(null), null);
  assert.equal(normaliseFlavour(''), null);
});

test('Flavour is a manually clamped 1-10 score', () => {
  assert.equal(normaliseFlavour(7), 7);
  assert.equal(normaliseFlavour('8'), 8);
  assert.equal(normaliseFlavour(99), 10);
  assert.equal(normaliseFlavour(-4), 1);
});

test('state payload injection persists or clears Flavour through card overrides', () => {
  const base = {
    version: 3,
    cards: {
      existing: { quality: 7 },
      other: { strength: 6 }
    },
    sections: { legendHtml: 'keep' }
  };

  const rated = injectFlavourIntoStatePayload(base, 'existing', 8);
  assert.equal(rated.cards.existing.flavour, 8);
  assert.equal(rated.cards.existing.quality, 7);
  assert.equal(rated.cards.other.strength, 6);
  assert.equal(rated.sections.legendHtml, 'keep');

  const cleared = injectFlavourIntoStatePayload(rated, 'existing', '');
  assert.equal(cleared.cards.existing.flavour, null);
});

test('Flavour renders as unrated or as a normal medal score', () => {
  assert.match(flavourRatingMarkup(null), /<span>Flavour<\/span>/);
  assert.match(flavourRatingMarkup(null), /Unrated/);
  assert.match(flavourRatingMarkup(7), /class="rating gold score-mid"/);
  assert.match(flavourRatingMarkup(7), /<small class="subscore">7\/10<\/small>/);
});

test('a Gem needs Gold in all five rating fields', () => {
  const allGold = { strength: 7, quality: 7, flavour: 7, size: 'gold', value: 7 };
  assert.equal(deriveAutoLaurel(allGold), 'gem');
  assert.equal(countGoldRatings(allGold), 5);

  // Drop any single field below Gold and it is a Crown, not a Gem.
  assert.equal(deriveAutoLaurel({ ...allGold, strength: 6 }), 'crown');
  assert.equal(deriveAutoLaurel({ ...allGold, quality: 6 }), 'crown');
  assert.equal(deriveAutoLaurel({ ...allGold, flavour: 6 }), 'crown');
  assert.equal(deriveAutoLaurel({ ...allGold, size: 'silver' }), 'crown');
  assert.equal(deriveAutoLaurel({ ...allGold, value: 6 }), 'crown');
});

test('exactly four Golds is a Crown and three or fewer earns neither', () => {
  assert.equal(deriveAutoLaurel({ strength: 7, quality: 7, flavour: 7, size: 'gold', value: 4 }), 'crown');
  assert.equal(deriveAutoLaurel({ strength: 7, quality: 7, flavour: 4, size: 'silver', value: 7 }), 'none');
  assert.equal(deriveAutoLaurel({ strength: 4, quality: 4, flavour: 4, size: 'bronze', value: 4 }), 'none');
});

test('an unrated Flavour is not a Gold, so it caps a cigar at Crown', () => {
  const unrated = { strength: 9, quality: 9, flavour: null, size: 'gold', value: 9 };
  assert.equal(countGoldRatings(unrated), 4);
  assert.equal(deriveAutoLaurel(unrated), 'crown');
});

test('laurels are decided by the Gold count alone, with no strength gate and no per-cigar exception', () => {
  // A weak cigar that is Gold everywhere else now earns its Crown; the old rule withheld
  // it entirely on Strength below 5.
  assert.equal(deriveAutoLaurel({ strength: 3, quality: 7, flavour: 7, size: 'gold', value: 7 }), 'crown');
  // The Axe Charutos quality exception used to hand out a Gem on three Golds.
  const threeGolds = { key: 'alonso-menendez-axe-charutos', strength: 7, quality: 6, flavour: 7, size: 'gold', value: 4 };
  assert.equal(countGoldRatings(threeGolds), 3);
  assert.equal(deriveAutoLaurel(threeGolds), 'none');
});

test('browser runtime loads Flavour UI, card hydration and save interception', () => {
  // Versioned because the size runtime registers the single Value writer on this exact
  // module instance; see test/value-single-writer.test.mjs, which pins every importer to
  // one specifier.
  assert.match(loaderSource, /import\('\.\/catalogue-flavour\.mjs\?v=mobile-one-column-1'\)/);
  assert.match(flavourSource, /catalogue-admin-flavour/);
  assert.match(flavourSource, /ensureFlavourRating/);
  assert.match(flavourSource, /MutationObserver/);
  assert.match(flavourSource, /api\/catalogue-overrides/);
});
