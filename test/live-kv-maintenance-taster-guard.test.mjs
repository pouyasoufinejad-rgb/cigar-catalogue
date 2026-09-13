import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintenanceMutation } from '../scripts/publish-live-maintenance-request.mjs';
import {
  suppressNonTargetTasterCohortMarkers,
  suppressNonTargetTasterStateMarkers,
  restoreNonTargetTasterStateMarkers
} from '../scripts/publish-live-maintenance-ranked-request.mjs';

function cardTag(key, attrs = '') {
  return `<article class="card" data-key="${key}" ${attrs}></article>`;
}

test('taster-tagged cards outside the explicit numbered cohort are validation-only exclusions and are restored unchanged', () => {
  const order = [
    'la-flor-dominicana-double-ligero-chiselito-maduro',
    'cao-eileens-dream-corona',
    'daniel-marshall-red-label-petit-corona',
    'arturo-fuente-exquisitos-maduro'
  ];
  const extras = {
    'cao-moontrance-tubos': { taster: true, rank: 20 },
    'deadwood-leather-rose-petite-corona': { taster: true, rank: 7 },
    'isla-del-sol-maduro-gran-corona': { taster: true, rank: 12 },
    'tabak-especial-colada-oscuro': { taster: true, catalogueType: 'taster', rank: 8 }
  };
  const state = {
    version: 3,
    sections: {},
    cards: {
      ...Object.fromEntries(order.map((key, index) => [key, { taster: true, rank: [1, 3, 4, 6][index] }])),
      ...extras
    },
    entries: {}
  };
  const html = [
    cardTag(order[0], 'data-taster="1" data-rank="1"'),
    cardTag(order[1], 'data-taster="1" data-rank="3"'),
    cardTag(order[2], 'data-taster="1" data-rank="4"'),
    cardTag(order[3], 'data-taster="1" data-rank="6"'),
    cardTag('cao-moontrance-tubos', 'data-taster="1" data-rank="20"'),
    cardTag('deadwood-leather-rose-petite-corona', 'data-taster="1" data-rank="7"'),
    cardTag('isla-del-sol-maduro-gran-corona', 'data-taster="1" data-rank="12"'),
    cardTag('tabak-especial-colada-oscuro', 'data-taster="1" data-catalogue-type="taster" data-rank="8"')
  ].join('');

  const suppressed = suppressNonTargetTasterStateMarkers(state, order);
  const filteredHtml = suppressNonTargetTasterCohortMarkers(html, order);
  const result = buildMaintenanceMutation(suppressed.state, filteredHtml, {
    operation: 'bulk-maintenance',
    tasterOrder: order
  });

  assert.deepEqual(order.map(key => result.state.cards[key].rank), [1, 2, 3, 4]);
  const restored = restoreNonTargetTasterStateMarkers(result.state, suppressed.markers);
  for (const [key, original] of Object.entries(extras)) {
    assert.deepEqual(restored.cards[key], original);
  }
});
