import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { normaliseEntry, renderEntryCard } from '../src/index.js';
import * as admin from '../public/catalogue-admin-unified-v139.mjs';

const adminSource = await readFile(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');

function sampleEntry(overrides = {}) {
  return {
    key: 'flavour-test',
    brand: 'Test Brand',
    title: 'Test Cigar',
    price: 12,
    packagePrice: 12,
    packageLabel: 'single cigar',
    length: 5,
    ring: 46,
    country: 'Nicaragua',
    strength: 6,
    quality: 7,
    size: 'gold',
    risk: 1,
    rank: 1,
    ...overrides
  };
}

test('Flavour is optional and remains unrated until explicitly assigned', () => {
  assert.equal(normaliseEntry(sampleEntry()).flavour, null);
  assert.equal(normaliseEntry(sampleEntry({ flavour: '' })).flavour, null);
});

test('Flavour is a manually persisted 1-10 score', () => {
  assert.equal(normaliseEntry(sampleEntry({ flavour: 7 })).flavour, 7);
  assert.equal(normaliseEntry(sampleEntry({ flavour: 99 })).flavour, 10);
  assert.equal(normaliseEntry(sampleEntry({ flavour: -4 })).flavour, 1);

  const editorial = admin.buildEditorialOverride({
    rank: 1,
    strength: 6,
    quality: 7,
    flavour: 8,
    size: 'gold',
    laurel: 'auto'
  });
  assert.equal(editorial.flavour, 8);

  const cleared = admin.buildEditorialOverride({
    rank: 1,
    strength: 6,
    quality: 7,
    flavour: '',
    size: 'gold',
    laurel: 'auto'
  });
  assert.equal(cleared.flavour, null);
});

test('dynamic cards render Flavour as unrated or as a normal medal score', () => {
  const unrated = renderEntryCard(sampleEntry());
  assert.match(unrated, /<span>Flavour<\/span>/);
  assert.match(unrated, /Unrated/);

  const rated = renderEntryCard(sampleEntry({ flavour: 7 }));
  assert.match(rated, /<span>Flavour<\/span>/);
  assert.match(rated, /Flavour<\/span><i[^>]*class="medal gold"[^>]*><\/i><b>Gold<\/b><small class="subscore">7\/10<\/small>/);
});

test('auto laurels count Flavour Gold while preserving the Strength 5+ gate', () => {
  assert.equal(typeof admin.deriveAutoLaurel, 'function');
  assert.equal(admin.deriveAutoLaurel({ strength: 6, quality: 7, flavour: 7, size: 'gold', value: 5 }), 'crown');
  assert.equal(admin.deriveAutoLaurel({ strength: 7, quality: 7, flavour: 7, size: 'gold', value: 7 }), 'gem');
  assert.equal(admin.deriveAutoLaurel({ strength: 4, quality: 7, flavour: 7, size: 'gold', value: 7 }), 'none');
  assert.equal(admin.deriveAutoLaurel({ strength: 6, quality: 7, flavour: null, size: 'gold', value: 7 }), 'crown');
});

test('admin UI exposes an optional Flavour editor and runtime card hydration', () => {
  assert.match(adminSource, /catalogue-admin-flavour/);
  assert.match(adminSource, /ensureFlavourRating/);
  assert.match(adminSource, /setOptionalRatingVisual/);
});
