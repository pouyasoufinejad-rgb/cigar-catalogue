import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanPracticalHtml,
  normaliseCadencePracticalHtml,
  normaliseProductionHtml,
  stripEyebrowRankPrefix,
  buildMaintenanceMutation
} from '../scripts/publish-live-maintenance-request.mjs';

function cardTag(key, attrs = '') {
  return `<article class="card" data-key="${key}" ${attrs}></article>`;
}

test('cleanPracticalHtml removes inline style wrappers while preserving visible line text', () => {
  const input = '<span style="background-color: rgb(1, 2, 3)"><span class="artmeta-line"><span style="text-wrap-mode: nowrap">Tin of 10</span></span></span><span class="artmeta-line">Fragile</span>';
  assert.equal(
    cleanPracticalHtml(input),
    '<span class="artmeta-line">Tin of 10</span><span class="artmeta-line">Fragile</span>'
  );
});

test('normaliseCadencePracticalHtml rejoins split Cadence token and removes leading nbsp', () => {
  const input = '<span class="artmeta-line">Tin</span><span class="artmeta-line">Forgiving Cadenc</span><span class="artmeta-line">e</span><span class="artmeta-line">&nbsp;Lenient Cadence</span>';
  assert.equal(
    normaliseCadencePracticalHtml(input),
    '<span class="artmeta-line">Tin</span><span class="artmeta-line">Forgiving Cadence</span><span class="artmeta-line">Lenient Cadence</span>'
  );
});

test('normaliseProductionHtml strips editor br attributes and rebuilds sibling lines', () => {
  const input = '<span class="artmeta-line">Machine-made<br data-start="4" data-end="8">Wrapper: Ecuador<br data-start="9" data-end="12">Binder: Nicaragua<br>Filler: Nicaragua</span>';
  assert.equal(
    normaliseProductionHtml(input),
    '<span class="artmeta-line">Machine-made</span><span class="artmeta-line">Wrapper: Ecuador</span><span class="artmeta-line">Binder: Nicaragua</span><span class="artmeta-line">Filler: Nicaragua</span>'
  );
});

test('stripEyebrowRankPrefix removes only a leading hardcoded No. rank prefix', () => {
  assert.equal(stripEyebrowRankPrefix('No. 23 — Coffee-infused Coronet'), 'Coffee-infused Coronet');
  assert.equal(stripEyebrowRankPrefix('No. 9 profile reference'), 'No. 9 profile reference');
});

test('buildMaintenanceMutation enforces exact taster order, clears archived ranks, and touches only requested fields', () => {
  const state = {
    version: 3,
    sections: { keep: 'yes' },
    cards: {
      'la-flor-dominicana-double-ligero-chiselito-maduro': { rank: 1, taster: true, quality: 9, flavour: 9 },
      'cao-eileens-dream-corona': { rank: 3, taster: true, quality: 7 },
      'daniel-marshall-red-label-petit-corona': { rank: 4, taster: true, quality: 7 },
      'arturo-fuente-exquisitos-maduro': { rank: 6, taster: true, quality: 8 },
      'rocky-patel-sun-grown-maduro-lancero-half': { rank: 2, archived: true, archivedRank: 2, catalogueType: 'half', quality: 8 },
      'cohiba-short-10': { rank: 20, archived: true, archivedRank: 20, quality: 7 },
      'styled': { rank: 1, practicalHtml: '<span class="artmeta-line" style="background-color:red">Cut</span>', eyebrow: 'No. 8 — Keep this', price: 12 },
      'blackened-m81-coronets': { rank: 2, summaryHtml: 'black pepprr and arguably offering arguably stronger construction', flavour: 7 },
      'kfc-ponies-sweets': { rank: 3, title: '* Kentucky Fire Cured Sweets Ponies — Tin of 10' },
      'tatiana-dolce-vanilla': { rank: 4, practicalHtml: '<span class="artmeta-line">Single<span class="artmeta-line">Cut</span><span class="artmeta-line">Fragile</span><span class="artmeta-line">Lenient Cadence</span>' },
      'foundation-wise-man-maduro-lancero-half': { rank: 1, catalogueType: 'half', practicalHtml: '' },
      'montecristo-short': { rank: 5, productionHtml: '<span class="artmeta-line">Machine-made<br data-start="1" data-end="2">Wrapper: Cuba<br>Binder: Cuba<br>Filler: Cuba</span>', flavour: 7, noteHtml: 'Untasted.' }
    },
    entries: {}
  };
  const html = [
    cardTag('la-flor-dominicana-double-ligero-chiselito-maduro', 'data-taster="1" data-rank="1"'),
    cardTag('cao-eileens-dream-corona', 'data-taster="1" data-rank="3"'),
    cardTag('daniel-marshall-red-label-petit-corona', 'data-taster="1" data-rank="4"'),
    cardTag('arturo-fuente-exquisitos-maduro', 'data-taster="1" data-rank="6"'),
    cardTag('rocky-patel-sun-grown-maduro-lancero-half', 'data-archived="1" data-archived-rank="2" data-rank="2" data-catalogue-type="half"'),
    cardTag('cohiba-short-10', 'data-archived="1" data-archived-rank="20" data-rank="20"')
  ].join('');

  const request = {
    operation: 'bulk-maintenance',
    tasterOrder: [
      'la-flor-dominicana-double-ligero-chiselito-maduro',
      'cao-eileens-dream-corona',
      'daniel-marshall-red-label-petit-corona',
      'arturo-fuente-exquisitos-maduro'
    ],
    scanPracticalInlineStyles: true,
    scanEyebrowRankPrefixes: true
  };

  const result = buildMaintenanceMutation(state, html, request);
  const cards = result.state.cards;

  assert.deepEqual(request.tasterOrder.map(key => cards[key].rank), [1, 2, 3, 4]);
  assert.equal('rank' in cards['rocky-patel-sun-grown-maduro-lancero-half'], false);
  assert.equal(cards['rocky-patel-sun-grown-maduro-lancero-half'].archivedRank, 2);
  assert.equal('rank' in cards['cohiba-short-10'], false);
  assert.equal(cards.styled.practicalHtml, '<span class="artmeta-line">Cut</span>');
  assert.equal(cards.styled.eyebrow, 'Keep this');
  assert.equal(cards.styled.price, 12);
  assert.equal(cards['blackened-m81-coronets'].summaryHtml, 'black pepper and offering arguably stronger construction');
  assert.equal(cards['blackened-m81-coronets'].flavour, 7);
  assert.equal(cards['kfc-ponies-sweets'].title, 'Kentucky Fire Cured Sweets Ponies — Tin of 10');
  assert.equal(cards['tatiana-dolce-vanilla'].practicalHtml, '<span class="artmeta-line">Single</span><span class="artmeta-line">Cut</span><span class="artmeta-line">Fragile</span><span class="artmeta-line">Lenient Cadence</span>');
  assert.equal(cards['foundation-wise-man-maduro-lancero-half'].practicalHtml, '<span class="artmeta-line">Two Half-Sticks</span><span class="artmeta-line">Cut before smoking</span><span class="artmeta-line">Fragile</span>');
  assert.equal(cards['montecristo-short'].productionHtml, '<span class="artmeta-line">Machine-made</span><span class="artmeta-line">Wrapper: Cuba</span><span class="artmeta-line">Binder: Cuba</span><span class="artmeta-line">Filler: Cuba</span>');
  assert.equal(cards['montecristo-short'].flavour, 7);
  assert.equal(cards['montecristo-short'].noteHtml, 'Untasted.');
  assert.deepEqual(result.state.sections, { keep: 'yes' });
});
