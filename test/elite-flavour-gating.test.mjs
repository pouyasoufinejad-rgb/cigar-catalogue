import test from 'node:test';
import assert from 'node:assert/strict';
import * as presentation from '../public/catalogue-presentation.mjs';

function fakeRating(label, classes = []) {
  const classSet = new Set(classes);
  return {
    classList: { contains: name => classSet.has(name) },
    querySelector: selector => selector === ':scope > span' ? { textContent: label } : null
  };
}

function fakeCard(ratings = [], rank = 1) {
  return {
    dataset: { rank: String(rank), stock: 'in' },
    classList: { contains: () => false },
    closest: () => null,
    parentElement: null,
    querySelectorAll: selector => selector === '.rating.gold'
      ? ratings.filter(rating => rating.classList.contains('gold'))
      : selector === '.rating' ? ratings : []
  };
}

function fakeGrid() {
  const grid = {
    children: [],
    querySelectorAll: selector => selector === ':scope > article.card' ? [...grid.children] : [],
    appendChild(card) {
      if (card.parentElement?.children) card.parentElement.children = card.parentElement.children.filter(item => item !== card);
      grid.children.push(card);
      card.parentElement = grid;
    },
    insertBefore(card, before) {
      if (card.parentElement?.children) card.parentElement.children = card.parentElement.children.filter(item => item !== card);
      const index = grid.children.indexOf(before);
      grid.children.splice(index < 0 ? grid.children.length : index, 0, card);
      card.parentElement = grid;
    }
  };
  return grid;
}

test('Elite keeps unrated flavour eligible but requires Gold when flavour is rated', () => {
  assert.equal(presentation.recommendationDestination(['strength', 'quality']), 'elite');
  assert.equal(presentation.recommendationDestination(['strength', 'quality'], { flavourRated: false }), 'elite');
  assert.equal(presentation.recommendationDestination(['strength', 'quality', 'flavour'], { flavourRated: true }), 'elite');
  assert.equal(presentation.recommendationDestination(['strength', 'quality'], { flavourRated: true }), 'strong');
});

test('card recommendation distinguishes unrated from rated non-Gold flavour', () => {
  const unrated = fakeCard([
    fakeRating('Strength', ['gold']),
    fakeRating('Quality', ['gold']),
    fakeRating('Flavour', ['flavour-unrated'])
  ]);
  const gold = fakeCard([
    fakeRating('Strength', ['gold']),
    fakeRating('Quality', ['gold']),
    fakeRating('Flavour', ['gold'])
  ]);
  const silver = fakeCard([
    fakeRating('Strength', ['gold']),
    fakeRating('Quality', ['gold']),
    fakeRating('Flavour', ['silver'])
  ]);

  assert.equal(presentation.recommendationDestinationForCard(unrated), 'elite');
  assert.equal(presentation.recommendationDestinationForCard(gold), 'elite');
  assert.equal(presentation.recommendationDestinationForCard(silver), 'strong');
});

test('rated non-Gold flavour moves an otherwise Elite card to Strong', () => {
  const elite = fakeGrid();
  const strong = fakeGrid();
  const substantial = fakeGrid();
  const cheap = fakeGrid();
  const neither = fakeGrid();
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
    querySelectorAll: selector => selector === 'article.card[data-key]' ? [...elite.children, ...strong.children] : []
  };

  const ratedSilver = fakeCard([
    fakeRating('Strength', ['gold']),
    fakeRating('Quality', ['gold']),
    fakeRating('Flavour', ['silver'])
  ]);
  const unrated = fakeCard([
    fakeRating('Strength', ['gold']),
    fakeRating('Quality', ['gold']),
    fakeRating('Flavour', ['flavour-unrated'])
  ], 2);
  const ratedGold = fakeCard([
    fakeRating('Strength', ['gold']),
    fakeRating('Quality', ['gold']),
    fakeRating('Flavour', ['gold'])
  ], 3);
  elite.appendChild(ratedSilver);
  elite.appendChild(unrated);
  elite.appendChild(ratedGold);

  assert.equal(presentation.reclassifySubstantialCards(root), 1);
  assert.equal(ratedSilver.parentElement, strong);
  assert.equal(unrated.parentElement, elite);
  assert.equal(ratedGold.parentElement, elite);
});
