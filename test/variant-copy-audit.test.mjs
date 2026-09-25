import test from 'node:test';
import assert from 'node:assert/strict';

import { sizesMentioned, inheritedSizeConflicts } from '../scripts/audit-variant-copy.mjs';

test('sizes written into prose are recognised in the shapes the catalogue uses', () => {
  assert.deepEqual(sizesMentioned('At 5″ × 43 it is narrow enough'), [{ length: 5, ring: 43 }]);
  assert.deepEqual(sizesMentioned('the 4.5in x 50 Rothschild'), [{ length: 4.5, ring: 50 }]);
  assert.deepEqual(sizesMentioned('a 4" x 36 format'), [{ length: 4, ring: 36 }]);
  assert.deepEqual(sizesMentioned('<strong>The 6 × 52 toro</strong>'), [{ length: 6, ring: 52 }]);
  // Not a size: years, prices, counts.
  assert.deepEqual(sizesMentioned('box of 20 at $115 in 1999'), []);
  assert.deepEqual(sizesMentioned('tin of 10'), []);
});

test('a variant only conflicts when the inherited prose names a different cigar', () => {
  const copy = 'At 5″ × 43 it is narrow enough to emphasise the wrapper.';
  // The size the copy was written about is fine.
  assert.equal(inheritedSizeConflicts(copy, { length: 5, ring: 43 }), null);
  // A different one is not: the page would state a size the reader is not looking at.
  assert.deepEqual(inheritedSizeConflicts(copy, { length: 6, ring: 52 }), { length: 5, ring: 43 });
  assert.deepEqual(inheritedSizeConflicts(copy, { length: 5, ring: 46 }), { length: 5, ring: 43 });
  // A variant with no dimensions of its own cannot be judged, so it is not accused.
  assert.equal(inheritedSizeConflicts(copy, {}), null);
  assert.equal(inheritedSizeConflicts(copy, { length: 5 }), null);
  // Rounding slack, so 4.375 against "4 3/8" style copy does not read as a clash.
  assert.equal(inheritedSizeConflicts('the 5″ × 43 corona', { length: 5.05, ring: 43 }), null);
  // Copy that names no size at all cannot conflict with anything.
  assert.equal(inheritedSizeConflicts('Dense, sweet and peppery.', { length: 7, ring: 52 }), null);
});
