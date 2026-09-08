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

function card(key, rank, { catalogueType = 'main' } = {}) {
  const ratings = [rating('Strength', ['gold']), rating('Quality', ['silver']), rating('Size', ['gold'])];
  return {
    dataset: { key, rank: String(rank), stock: 'in', archived: '0', catalogueType },
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

function rootFor(cards, strong, elite, cheap, neither) {
  const selectors = new Map([
    ['[data-tier-section="elite"] .grid', elite],
    ['[data-tier-section="strong"] .grid', strong],
    ['[data-noteworthy-section="cheap"] .grid', cheap],
    ['[data-noteworthy-section="neither"] .grid', neither]
  ]);
  return {
    getElementById: id => id === 'sort' ? { value: 'rank' } : null,
    querySelector: selector => selectors.get(selector) || null,
    querySelectorAll: selector => selector === 'article.card[data-key]' ? cards : []
  };
}

test('Strength plus Size Gold without a separate cohort stays in Strong', () => {
  const strong = grid();
  const elite = grid();
  const cheap = grid();
  const neither = grid();
  const ordinary = card('ordinary-corona', 14);
  neither.appendChild(ordinary);
  const root = rootFor([ordinary], strong, elite, cheap, neither);

  assert.equal(presentation.reclassifyRecommendationCards(root), 1);
  assert.equal(ordinary.parentElement, strong);
});

test('explicit Half-Cigar entries are ignored by recommendation routing', () => {
  const strong = grid();
  const elite = grid();
  const cheap = grid();
  const neither = grid();
  const half = card('half-session', 1, { catalogueType: 'half' });
  strong.appendChild(half);
  const root = rootFor([half], strong, elite, cheap, neither);

  assert.equal(presentation.reclassifyRecommendationCards(root), 0);
  assert.equal(half.parentElement, strong);
});
