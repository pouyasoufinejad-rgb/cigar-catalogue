import test from 'node:test';
import assert from 'node:assert/strict';

import { COPY, applyCopy } from '../scripts/fix-live-variant-size-copy.mjs';
import { sizesMentioned } from '../scripts/audit-variant-copy.mjs';

// The ten variants the live audit found inheriting copy about a different size, with the
// size each one actually is. Written out so a copy-paste slip in the prose is caught here
// rather than on the page.
const EXPECTED = {
  'davidoff-winston-churchill-petite-panatela': {
    'petit-corona': [4.5, 41], robusto: [5.5, 52], churchill: [6.875, 47]
  },
  'aj-fernandez-new-world-cameroon-short-robusto': {
    'double-robusto': [5.5, 54], toro: [6, 50]
  },
  'aj-fernandez-new-world-oscuro': { toro: [6.5, 55] },
  'foundation-charter-oak-maduro-rothschild': { 'petite-corona': [5.25, 42], grande: [6, 60] },
  'rocky-patel-sun-grown-juniors': { robusto: [5.5, 50] },
  'undercrown-10-corona-viva': { toro: [6, 52] }
};

test('the fix covers exactly the variants the audit found', () => {
  assert.deepEqual(Object.keys(COPY).sort(), Object.keys(EXPECTED).sort());
  for (const [key, variants] of Object.entries(EXPECTED)) {
    assert.deepEqual(Object.keys(COPY[key]).sort(), Object.keys(variants).sort(), key);
  }
  const total = Object.values(COPY).reduce((n, card) => n + Object.keys(card).length, 0);
  assert.equal(total, 10);
});

test('every new summary names the size its own variant actually is', () => {
  for (const [key, variants] of Object.entries(EXPECTED)) {
    for (const [id, [length, ring]] of Object.entries(variants)) {
      const { summaryHtml, noteHtml } = COPY[key][id];
      const sizes = sizesMentioned(summaryHtml);
      assert.ok(sizes.length > 0, `${key}:${id} summary names no size at all`);
      for (const size of sizes) {
        assert.ok(Math.abs(size.length - length) < 0.06 && size.ring === ring,
          `${key}:${id} is ${length}x${ring} but its new copy says ${size.length}x${size.ring}`);
      }
      // The note is what shows under the summary; it must not contradict it either.
      for (const size of sizesMentioned(noteHtml)) {
        assert.ok(Math.abs(size.length - length) < 0.06 && size.ring === ring,
          `${key}:${id} note says ${size.length}x${size.ring}`);
      }
    }
  }
});

test('the copy is substantial and not boilerplate repeated across variants', () => {
  const summaries = [];
  for (const card of Object.values(COPY)) {
    for (const { summaryHtml, noteHtml } of Object.values(card)) {
      assert.ok(summaryHtml.length > 240, `too thin: ${summaryHtml.slice(0, 60)}`);
      assert.ok(noteHtml.length > 60);
      assert.match(summaryHtml, /^<strong>/, 'the house style opens with the flavour line');
      assert.ok(!/\(projected\)|untasted/i.test(summaryHtml + noteHtml), 'no status filler');
      summaries.push(summaryHtml);
    }
  }
  // Same-blend variants share their opening flavour sentence by design, but no two
  // variants may be wholly identical or the size commentary was not written.
  assert.equal(new Set(summaries).size, summaries.length, 'two variants share the same summary');
});

test('applying the copy changes nothing else about a variant', () => {
  const before = [
    { id: 'toro', length: 6, ring: 52, price: 64, retailerLinks: ['https://x'], practicalLines: ['single cigar'] },
    { id: 'other', price: 10 }
  ];
  const after = applyCopy(before, COPY['undercrown-10-corona-viva']);
  assert.equal(after[0].price, 64);
  assert.equal(after[0].ring, 52);
  assert.deepEqual(after[0].retailerLinks, ['https://x']);
  assert.deepEqual(after[0].practicalLines, ['single cigar']);
  assert.deepEqual(after[1], { id: 'other', price: 10 }, 'an unnamed variant is left alone');
  // Re-running writes nothing, so a repeated sweep cannot churn KV.
  assert.equal(applyCopy(after, COPY['undercrown-10-corona-viva']), null);
  assert.equal(applyCopy(undefined, COPY['undercrown-10-corona-viva']), null);
});
