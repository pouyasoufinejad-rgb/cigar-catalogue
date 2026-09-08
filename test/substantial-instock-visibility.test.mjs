import test from 'node:test';
import assert from 'node:assert/strict';
import * as presentation from '../public/catalogue-presentation.mjs';

function rating(label, classes = []) {
  const classSet = new Set(classes);
  return {
    classList: { contains: name => classSet.has(name) },
    querySelector: selector => selector === ':scope > span' ? { textContent: label } : null
  };
}

function card(key, rank, { title = '', practical = '', note = '' } = {}) {
  const ratings = [rating('Strength', ['gold']), rating('Quality', ['silver']), rating('Size', ['gold'])];
  return {
    dataset: { key, rank: String(rank), stock: 'in', archived: '0', taster: '0' },
    classList: { contains: () => false },
    closest: () => null,
    parentElement: null,
    querySelector: selector => {
      if (selector === 'h3') return { textContent: title || key };
      if (selector === '.artmeta-right') return { textContent: practical };
      if (selector === '.mog-note') return { textContent: note };
      return null;
    },
    querySelectorAll: selector => selector === '.rating.gold'
      ? ratings.filter(item => item.classList.contains('gold'))
      : selector === '.rating' ? ratings : []
  };
}

function grid() {
  const value = {
    children: [],
    querySelectorAll: selector => selector === ':scope > article.card' ? [...value.children] : [],
    appendChild(item) {
      if (item.parentElement?.children) item.parentElement.children = item.parentElement.children.filter(child => child !== item);
      value.children.push(item);
      item.parentElement = value;
    },
    insertBefore(item, before) {
      if (item.parentElement?.children) item.parentElement.children = item.parentElement.children.filter(child => child !== item);
      const index = value.children.indexOf(before);
      value.children.splice(index < 0 ? value.children.length : index, 0, item);
      item.parentElement = value;
    }
  };
  return value;
}

test('moving in-stock half and halve entries into The Half-Cigar refreshes group visibility immediately', () => {
  const strong = grid();
  const halfCigar = grid();
  const elite = grid();
  const cheap = grid();
  const neither = grid();
  const halfTitle = card('example-half-corona', 12, { title: 'Example Half Corona' });
  const halvePractical = card('example-long-corona', 13, { practical: 'Single · Halve before smoking' });
  strong.appendChild(halfTitle);
  strong.appendChild(halvePractical);

  const selectors = new Map([
    ['[data-noteworthy-section="substantial"] .grid', halfCigar],
    ['[data-tier-section="elite"] .grid', elite],
    ['[data-tier-section="strong"] .grid', strong],
    ['[data-noteworthy-section="cheap"] .grid', cheap],
    ['[data-noteworthy-section="neither"] .grid', neither]
  ]);
  const root = {
    getElementById: id => id === 'sort' ? { value: 'rank' } : null,
    querySelector: selector => selectors.get(selector) || null,
    querySelectorAll: selector => selector === 'article.card[data-key]' ? [...strong.children, ...halfCigar.children] : []
  };

  let visibilityRefreshes = 0;
  const previousWindow = globalThis.window;
  globalThis.window = { refreshGroupVisibility: () => { visibilityRefreshes += 1; } };
  try {
    assert.equal(presentation.reclassifySubstantialCards(root), 2);
    assert.equal(halfTitle.parentElement, halfCigar);
    assert.equal(halvePractical.parentElement, halfCigar);
    assert.equal(visibilityRefreshes, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('Strength plus Size Gold without half or halve stays in Strong', () => {
  const strong = grid();
  const halfCigar = grid();
  const elite = grid();
  const cheap = grid();
  const neither = grid();
  const ordinary = card('ordinary-corona', 14, { title: 'Ordinary Corona', practical: 'Single · Uncut' });
  halfCigar.appendChild(ordinary);

  const selectors = new Map([
    ['[data-noteworthy-section="substantial"] .grid', halfCigar],
    ['[data-tier-section="elite"] .grid', elite],
    ['[data-tier-section="strong"] .grid', strong],
    ['[data-noteworthy-section="cheap"] .grid', cheap],
    ['[data-noteworthy-section="neither"] .grid', neither]
  ]);
  const root = {
    getElementById: id => id === 'sort' ? { value: 'rank' } : null,
    querySelector: selector => selectors.get(selector) || null,
    querySelectorAll: selector => selector === 'article.card[data-key]' ? [...strong.children, ...halfCigar.children] : []
  };

  assert.equal(presentation.reclassifySubstantialCards(root), 1);
  assert.equal(ordinary.parentElement, strong);
});
