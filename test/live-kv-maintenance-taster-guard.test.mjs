import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintenanceMutation } from '../scripts/publish-live-maintenance-request.mjs';
import {
  suppressRanklessTasterCohortMarkers,
  suppressRanklessTasterStateMarkers,
  restoreRanklessTasterStateMarkers
} from '../scripts/publish-live-maintenance-ranked-request.mjs';

function cardTag(key, attrs = '') {
  return `<article class="card" data-key="${key}" ${attrs}></article>`;
}

test('rankless taster-flag cards in KV are hidden only from numbered taster validation', () => {
  const order = [
    'la-flor-dominicana-double-ligero-chiselito-maduro',
    'cao-eileens-dream-corona',
    'daniel-marshall-red-label-petit-corona',
    'arturo-fuente-exquisitos-maduro'
  ];
  const state = {
    version: 3,
    sections: {},
    cards: {
      ...Object.fromEntries(order.map((key, index) => [key, { taster: true, rank: [1, 3, 4, 6][index] }])),
      'cao-moontrance-tubos': { taster: true },
      'deadwood-leather-rose-petite-corona': { taster: true },
      'isla-del-sol-maduro-gran-corona': { taster: true },
      'tabak-especial-colada-oscuro': { taster: true, catalogueType: 'taster' }
    },
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

  const suppressed = suppressRanklessTasterStateMarkers(state);
  const filteredHtml = suppressRanklessTasterCohortMarkers(html);
  const result = buildMaintenanceMutation(suppressed.state, filteredHtml, {
    operation: 'bulk-maintenance',
    tasterOrder: order
  });

  assert.deepEqual(order.map(key => result.state.cards[key].rank), [1, 2, 3, 4]);
  const restored = restoreRanklessTasterStateMarkers(result.state, suppressed.markers);
  for (const key of ['cao-moontrance-tubos', 'deadwood-leather-rose-petite-corona', 'isla-del-sol-maduro-gran-corona']) {
    assert.equal(restored.cards[key].taster, true);
    assert.equal('rank' in restored.cards[key], false);
  }
  assert.equal(restored.cards['tabak-especial-colada-oscuro'].taster, true);
  assert.equal(restored.cards['tabak-especial-colada-oscuro'].catalogueType, 'taster');
  assert.equal('rank' in restored.cards['tabak-especial-colada-oscuro'], false);
});
