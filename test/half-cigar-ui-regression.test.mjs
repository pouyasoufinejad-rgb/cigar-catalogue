import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as presentation from '../public/catalogue-presentation.mjs';

const source = await readFile(new URL('../public/catalogue-presentation.mjs', import.meta.url), 'utf8');

function fakeCard({ text = '', taster = '0', archived = '0', stock = 'in' } = {}) {
  return {
    dataset: { taster, archived, stock, key: 'example' },
    textContent: text,
    querySelector() { return null; }
  };
}

test('Half-Cigar UI does not inject a second ranking/recommendations structure or rewrite rank captions', () => {
  assert.doesNotMatch(source, /data-ranking-section/);
  assert.doesNotMatch(source, /data-recommendations-heading/);
  assert.doesNotMatch(source, /catalogue-tasters-selected/);
  assert.doesNotMatch(source, /normaliseCardRankCaption/);
});

test('Half-Cigar filter matches only active available main entries containing half or halv wording', () => {
  assert.equal(typeof presentation.halfCigarFilterMatchesCard, 'function');
  assert.equal(presentation.halfCigarFilterMatchesCard(fakeCard({ text: 'Pre-cut in half before lighting' })), true);
  assert.equal(presentation.halfCigarFilterMatchesCard(fakeCard({ text: 'Halve before lighting' })), true);
  assert.equal(presentation.halfCigarFilterMatchesCard(fakeCard({ text: 'Ordinary robusto' })), false);
  assert.equal(presentation.halfCigarFilterMatchesCard(fakeCard({ text: 'Half Corona', taster: '1' })), false);
  assert.equal(presentation.halfCigarFilterMatchesCard(fakeCard({ text: 'Half Corona', archived: '1' })), false);
  assert.equal(presentation.halfCigarFilterMatchesCard(fakeCard({ text: 'Half Corona', stock: 'out' })), false);
});

test('Half Cigars control is a narrow filter and does not intercept the existing toggle controls', () => {
  assert.match(source, /Half Cigars/);
  assert.match(source, /data-half-cigar-filter/);
  assert.match(source, /applyHalfCigarFilter/);
  assert.doesNotMatch(source, /halfCigarExitBound/);
  assert.doesNotMatch(source, /body\.classList\.toggle\(['"]catalogue-half-only/);
});
