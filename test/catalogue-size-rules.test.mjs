import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  sizeScoreForRing,
  sizeTierForRing,
  sizeRatingForRing,
} from '../public/catalogue-size-rules.mjs';

test('size score follows the agreed ring-gauge preference bands', () => {
  const cases = [
    [20, 4], [22, 4],
    [23, 5], [26, 5],
    [27, 6], [30, 6],
    [31, 7], [34, 7],
    [35, 8], [38, 8],
    [39, 9], [40, 9],
    [41, 10], [44, 10],
    [45, 9], [48, 9],
    [49, 8], [56, 8],
  ];

  for (const [ring, expected] of cases) {
    assert.equal(sizeScoreForRing(ring), expected, `${ring} RG`);
  }
});

test('Size Gold is exactly 31 through 56 ring gauge', () => {
  assert.equal(sizeTierForRing(30), 'silver');
  assert.equal(sizeTierForRing(31), 'gold');
  assert.equal(sizeTierForRing(56), 'gold');
  assert.equal(sizeTierForRing(57), 'silver');
});

test('size rating returns both medal tier and numeric score', () => {
  assert.deepEqual(sizeRatingForRing(32), { tier: 'gold', score: 7 });
  assert.deepEqual(sizeRatingForRing(35), { tier: 'gold', score: 8 });
  assert.deepEqual(sizeRatingForRing(42), { tier: 'gold', score: 10 });
  assert.deepEqual(sizeRatingForRing(50), { tier: 'gold', score: 8 });
});

test('catalogue runtime loader installs the updated size presentation', () => {
  const source = fs.readFileSync(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
  assert.match(source, /import\(['"]\.\/catalogue-size-presentation\.mjs['"]\)/);
});

test('size presentation derives card display and editor saves from ring gauge', () => {
  const source = fs.readFileSync(new URL('../public/catalogue-size-presentation.mjs', import.meta.url), 'utf8');
  assert.match(source, /sizeRatingForRing\(ring\)/);
  assert.match(source, /subscore\.textContent = `\$\{score\}\/10`/);
  assert.match(source, /const tier = sizeTierForRing\(ring\)/);
  assert.match(source, /SAVE_BUTTON_ID/);
  assert.match(source, /syncAdminSizeFromRing\(document\)/);
});
