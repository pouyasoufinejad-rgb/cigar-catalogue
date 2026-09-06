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

function card(key, rank) {
  const ratings = [rating('Strength', ['gold']), rating('Quality', ['silver']), rating('Size', ['gold'])];
  return {
    dataset: { key, rank: String(rank), stock: 'in', archived: '0', taster: '0' },
    classList: { contains: () => false },
    closest: () => null,
    parentElement: null,
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

test('moving in-stock Strength+Size cards into Substantial refreshes group visibility immediately', () => {
  const strong = grid();
  const substantial = grid();
  const elite = grid();
  const cheap = grid();
  const neither = grid();
  const kfc = card('kfc-ponies', 12);
  const aj = card('aj-fernandez-new-world-oscuro', 13);
  strong.appendChild(kfc);
  strong.appendChild(aj);

  const selectors = new Map([
    ['[data-noteworthy-section="substantial"] .grid', substantial],
    ['[data-tier-section="elite"] .grid', elite],
    ['[data-tier-section="strong"] .grid', strong],
    ['[data-noteworthy-section="cheap"] .grid', cheap],
    ['[data-noteworthy-section="neither"] .grid', neither]
  ]);
  const root = {
    getElementById: id => id === 'sort' ? { value: 'rank' } : null,
    querySelector: selector => selectors.get(selector) || null,
    querySelectorAll: selector => selector === 'article.card[data-key]' ? [...strong.children, ...substantial.children] : []
  };

  let visibilityRefreshes = 0;
  const previousWindow = globalThis.window;
  globalThis.window = { refreshGroupVisibility: () => { visibilityRefreshes += 1; } };
  try {
    assert.equal(presentation.reclassifySubstantialCards(root), 2);
    assert.equal(kfc.parentElement, substantial);
    assert.equal(aj.parentElement, substantial);
    assert.equal(visibilityRefreshes, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
