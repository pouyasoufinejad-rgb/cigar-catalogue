import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  deriveAutoLaurel,
  flavourRatingMarkup,
  injectFlavourIntoStatePayload,
  normaliseFlavour
} from '../public/catalogue-flavour.mjs';

// Behaviour tests for the fifth manual catalogue rating.
const loaderSource = await readFile(new URL('../public/catalogue-value.mjs', import.meta.url), 'utf8');
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

test('auto laurels count Flavour Gold while preserving the Strength 5+ gate', () => {
  assert.equal(deriveAutoLaurel({ strength: 6, quality: 7, flavour: 7, size: 'gold', value: 5 }), 'crown');
  assert.equal(deriveAutoLaurel({ strength: 7, quality: 7, flavour: 7, size: 'gold', value: 7 }), 'gem');
  assert.equal(deriveAutoLaurel({ strength: 4, quality: 7, flavour: 7, size: 'gold', value: 7 }), 'none');
  assert.equal(deriveAutoLaurel({ strength: 6, quality: 7, flavour: null, size: 'gold', value: 7 }), 'crown');
});

test('browser runtime loads Flavour UI, card hydration and save interception', () => {
  assert.match(loaderSource, /import\('\.\/catalogue-flavour\.mjs'\)/);
  assert.match(flavourSource, /catalogue-admin-flavour/);
  assert.match(flavourSource, /ensureFlavourRating/);
  assert.match(flavourSource, /MutationObserver/);
  assert.match(flavourSource, /api\/catalogue-overrides/);
});
