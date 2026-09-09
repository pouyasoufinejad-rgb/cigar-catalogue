import test from 'node:test';
import assert from 'node:assert/strict';

const cohort = await import('../public/catalogue-half-cohort.mjs');

test('rank visual refresh never rewrites the editable eyebrow text', () => {
  let eyebrowText = 'Untasted candidate';
  let eyebrowWrites = 0;
  const eyebrow = {
    get textContent() { return eyebrowText; },
    set textContent(value) { eyebrowWrites += 1; eyebrowText = value; }
  };
  const label = { textContent: 'Half-Cigar' };
  const value = { textContent: 'H2' };
  const rankflag = {
    querySelector(selector) {
      if (selector === 'span') return label;
      if (selector === 'b') return value;
      return null;
    }
  };
  const card = {
    dataset: { catalogueType: 'half', rank: '2', archived: '0' },
    textContent: 'Untasted candidate',
    querySelector(selector) {
      if (selector === '.rankflag') return rankflag;
      if (selector === '.eyebrow') return eyebrow;
      return null;
    }
  };

  cohort.updateCardRankVisual(card);
  assert.equal(eyebrowText, 'Untasted candidate');
  assert.equal(eyebrowWrites, 0);

  eyebrowText = 'Manually edited eyebrow';
  cohort.updateCardRankVisual(card);
  assert.equal(eyebrowText, 'Manually edited eyebrow');
  assert.equal(eyebrowWrites, 0, 'rank refresh must never regenerate an eyebrow prefix');
});
