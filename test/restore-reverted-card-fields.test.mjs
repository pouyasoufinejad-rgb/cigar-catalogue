import test from 'node:test';
import assert from 'node:assert/strict';
import { planRestore, applyRestores } from '../scripts/restore-reverted-card-fields.mjs';

const seed = {
  cards: {
    reverted: { eyebrow: 'No. 7 — Best premium broadleaf benchmark', summaryHtml: '<p>Old corona copy</p>' },
    edited: { eyebrow: 'No. 3 — Best original', price: 20 },
    untouched: { eyebrow: 'No. 1 — Best unchanged' }
  }
};

test('restores a field that reverted to the static seed baseline', () => {
  const live = { cards: { reverted: { eyebrow: 'premium broadleaf benchmark' } }, entries: {} };
  const ledger = new Map([['reverted', { eyebrow: 'Broadleaf Lancero split into short premium sessions' }]]);
  const { restores, manualDivergences } = planRestore({ live, seed, ledger });
  assert.equal(restores.length, 1);
  assert.equal(restores[0].key, 'reverted');
  assert.equal(restores[0].field, 'eyebrow');
  assert.equal(restores[0].target, 'Broadleaf Lancero split into short premium sessions');
  assert.equal(manualDivergences.length, 0);
});

test('never overwrites a value that diverges from both the seed and the ledger', () => {
  const live = { cards: { edited: { eyebrow: 'A later hand-written eyebrow', price: 42 } }, entries: {} };
  const ledger = new Map([['edited', { eyebrow: 'Ledger eyebrow', price: 37.39 }]]);
  const { restores, manualDivergences } = planRestore({ live, seed, ledger });
  assert.equal(restores.length, 0, 'later deliberate edits must be preserved');
  assert.deepEqual(manualDivergences.map(row => row.field).sort(), ['eyebrow', 'price']);
});

test('ignores fields that already match the ledger', () => {
  const live = { cards: { untouched: { eyebrow: 'unchanged' } }, entries: {} };
  const ledger = new Map([['untouched', { eyebrow: 'No. 1 — Best unchanged' }]]);
  const { restores, manualDivergences } = planRestore({ live, seed, ledger });
  assert.equal(restores.length, 0);
  assert.equal(manualDivergences.length, 0);
});

test('skips keys that are absent from live state entirely', () => {
  const live = { cards: {}, entries: {} };
  const ledger = new Map([['reverted', { eyebrow: 'Anything' }]]);
  const { restores } = planRestore({ live, seed, ledger });
  assert.equal(restores.length, 0);
});

test('treats an empty live value as reverted when the seed does not declare the field', () => {
  const live = { cards: { reverted: { noteHtml: '' } }, entries: {} };
  const ledger = new Map([['reverted', { noteHtml: 'Card represents one pre-light half of the Lancero.' }]]);
  const { restores } = planRestore({ live, seed, ledger });
  assert.equal(restores.length, 1);
  assert.equal(restores[0].field, 'noteHtml');
});

test('applies restores to both the card and the dynamic entry without touching other fields', () => {
  const live = {
    version: 3,
    cards: { reverted: { eyebrow: 'premium broadleaf benchmark', rank: 2, imageUrl: '/keep' } },
    entries: { reverted: { eyebrow: 'premium broadleaf benchmark', rank: 2 } },
    sections: { recommendationSubsections: [{ id: 'petit-panatelas', entryKeys: ['reverted'] }] }
  };
  const next = applyRestores(live, [{ key: 'reverted', field: 'eyebrow', target: 'Lancero eyebrow' }]);
  assert.equal(next.cards.reverted.eyebrow, 'Lancero eyebrow');
  assert.equal(next.entries.reverted.eyebrow, 'Lancero eyebrow');
  assert.equal(next.cards.reverted.rank, 2);
  assert.equal(next.cards.reverted.imageUrl, '/keep');
  assert.deepEqual(next.sections, live.sections);
});
