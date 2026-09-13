import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recommendationRankCohort,
  textLooksFlavoured
} from '../public/catalogue-recommendation-cohorts.mjs';
import {
  parseStaticRankingCards,
  completeRankingCards,
  normaliseRankings
} from '../scripts/publish-catalogue-request.mjs';

function state(entries = {}) {
  return { version: 3, cards: {}, sections: {}, entries };
}

test('recommendation cohorts use the 34 RG boundary and flavoured override', () => {
  assert.equal(recommendationRankCohort({ recommendation: true, ring: 34, flavoured: false }), 'coronets');
  assert.equal(recommendationRankCohort({ recommendation: true, ring: 35, flavoured: false }), 'petit-panatelas');
  assert.equal(recommendationRankCohort({ recommendation: true, ring: 26, flavoured: true }), 'flavoured');
  assert.equal(recommendationRankCohort({ recommendation: false, ring: 32, flavoured: false }), '');
  assert.equal(textLooksFlavoured('Wrapper: Maduro · Infused'), true);
  assert.equal(textLooksFlavoured('Flavoured'), true);
  assert.equal(textLooksFlavoured('Traditional long filler'), false);
});

test('static ranking parser derives recommendation cohort from card markup', () => {
  const html = `
    <article class="card" data-key="coronet" data-rank="1" data-catalogue-type="main" data-strength="3" data-quality="2"><div class="artframe" data-visual-ring="34"></div><div class="artmeta-left">Traditional</div></article>
    <article class="card" data-key="petit" data-rank="2" data-catalogue-type="main" data-strength="2" data-quality="3"><div class="artframe" data-visual-ring="35"></div></article>
    <article class="card" data-key="flavour" data-rank="3" data-catalogue-type="main" data-strength="3" data-quality="2"><div class="artframe" data-visual-ring="30"></div><div class="artmeta-left">Flavoured</div></article>
    <article class="card" data-key="noteworthy" data-rank="4" data-catalogue-type="main" data-strength="2" data-quality="2" data-value="3"><div class="artframe" data-visual-ring="32"></div></article>`;

  const cards = parseStaticRankingCards(html);
  assert.equal(cards.find(row => row.key === 'coronet')?.recommendationCohort, 'coronets');
  assert.equal(cards.find(row => row.key === 'petit')?.recommendationCohort, 'petit-panatelas');
  assert.equal(cards.find(row => row.key === 'flavour')?.recommendationCohort, 'flavoured');
  assert.equal(cards.find(row => row.key === 'noteworthy')?.recommendationCohort, '');
});

test('publisher compacts each recommendation subsection independently while leaving non-recommendations out', () => {
  const html = `
    <article class="card" data-key="coronet-a" data-rank="1" data-catalogue-type="main" data-strength="3" data-quality="2"><div class="artframe" data-visual-ring="34"></div></article>
    <article class="card" data-key="petit-a" data-rank="2" data-catalogue-type="main" data-strength="3" data-quality="2"><div class="artframe" data-visual-ring="40"></div></article>
    <article class="card" data-key="flavour-a" data-rank="3" data-catalogue-type="main" data-strength="3" data-quality="2"><div class="artframe" data-visual-ring="30"></div><span>Infused</span></article>
    <article class="card" data-key="coronet-b" data-rank="4" data-catalogue-type="main" data-strength="3" data-quality="2"><div class="artframe" data-visual-ring="32"></div></article>
    <article class="card" data-key="noteworthy" data-rank="5" data-catalogue-type="main" data-strength="2" data-quality="2" data-value="3"><div class="artframe" data-visual-ring="30"></div></article>
    <article class="card" data-key="half-a" data-rank="1" data-catalogue-type="half"></article>
    <article class="card" data-key="taster-a" data-rank="1" data-catalogue-type="taster"></article>`;

  const staticCards = parseStaticRankingCards(html);
  const next = state();
  normaliseRankings(next, staticCards, state(), {});

  assert.equal(next.cards['coronet-a'].rank, 1);
  assert.equal(next.cards['coronet-b'].rank, 2);
  assert.equal(next.cards['petit-a'].rank, 1);
  assert.equal(next.cards['flavour-a'].rank, 1);
  assert.equal(next.cards['half-a'].rank, 1);
  assert.equal(next.cards['taster-a'].rank, 1);
  assert.equal(next.cards.noteworthy?.rank, undefined);
});

test('dynamic entries participate in the same recommendation cohorts', () => {
  const catalogue = state({
    'dynamic-coronet': {
      key: 'dynamic-coronet', brand: 'A', title: 'A', rank: 7, ring: 34,
      strength: 7, quality: 6, productionLines: ['Traditional'], taster: false, archived: false
    },
    'dynamic-flavour': {
      key: 'dynamic-flavour', brand: 'B', title: 'B', rank: 9, ring: 40,
      strength: 7, quality: 6, productionLines: ['Flavoured'], taster: false, archived: false
    }
  });

  const rows = completeRankingCards(catalogue, []);
  assert.equal(rows.find(row => row.key === 'dynamic-coronet')?.recommendationCohort, 'coronets');
  assert.equal(rows.find(row => row.key === 'dynamic-flavour')?.recommendationCohort, 'flavoured');
});
