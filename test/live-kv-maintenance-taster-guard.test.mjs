import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintenanceMutation } from '../scripts/publish-live-maintenance-request.mjs';
import { suppressRanklessTasterCohortMarkers } from '../scripts/publish-live-maintenance-ranked-request.mjs';

function cardTag(key, attrs = '') {
  return `<article class="card" data-key="${key}" ${attrs}></article>`;
}

test('rankless taster-flag cards are not members of the ranked taster cohort', () => {
  const order = [
    'la-flor-dominicana-double-ligero-chiselito-maduro',
    'cao-eileens-dream-corona',
    'daniel-marshall-red-label-petit-corona',
    'arturo-fuente-exquisitos-maduro'
  ];
  const state = {
    version: 3,
    sections: {},
    cards: Object.fromEntries(order.map((key, index) => [key, { taster: true, rank: [1, 3, 4, 6][index] }])),
    entries: {}
  };
  const html = [
    cardTag(order[0], 'data-taster="1" data-rank="1"'),
    cardTag(order[1], 'data-taster="1" data-rank="3"'),
    cardTag(order[2], 'data-taster="1" data-rank="4"'),
    cardTag(order[3], 'data-taster="1" data-rank="6"'),
    cardTag('cao-moontrance-tubos', 'data-taster="1"'),
    cardTag('deadwood-leather-rose-petite-corona', 'data-taster="1"'),
    cardTag('isla-del-sol-maduro-gran-corona', 'data-taster="1"'),
    cardTag('tabak-especial-colada-oscuro', 'data-taster="1" data-catalogue-type="taster"')
  ].join('');

  const filteredHtml = suppressRanklessTasterCohortMarkers(html);
  assert.match(filteredHtml, /la-flor-dominicana-double-ligero-chiselito-maduro[^>]*data-taster="1"[^>]*data-rank="1"/);
  assert.match(filteredHtml, /cao-moontrance-tubos[^>]*data-taster="0"/);
  assert.match(filteredHtml, /tabak-especial-colada-oscuro[^>]*data-catalogue-type="main"/);

  const result = buildMaintenanceMutation(state, filteredHtml, {
    operation: 'bulk-maintenance',
    tasterOrder: order
  });

  assert.deepEqual(order.map(key => result.state.cards[key].rank), [1, 2, 3, 4]);
  assert.equal(result.state.cards['cao-moontrance-tubos'], undefined);
});
