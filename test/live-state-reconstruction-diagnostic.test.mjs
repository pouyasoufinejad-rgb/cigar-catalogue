import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const HISTORICAL_ARCHIVED = [
  'aj-fernandez-new-world-oscuro',
  'arturo-fuente-hemingway-classic-natural',
  'cao-bella-vanilla-petit-corona',
  'cohiba-short-10',
  'cohiba-short-single',
  'curivari-fuerte-chicos',
  'curivari-fuerte-churchill-single',
  'davidoff-escurio-petit-robusto',
  'don-pepin-garcia-demi-tasse',
  'el-rey-del-mundo-demi-tasse',
  'hoyo-de-monterrey-le-hoyo-du-maire',
  'java-x-press-maduro',
  'liga-privada-no-9-short-panatela',
  'liga-privada-t52-short-panatela',
  'liga-t52-coronets',
  'montecristo-club',
  'montecristo-joyitas',
  'oliva-serie-g',
  'oliva-serie-g-petit-corona',
  'oliva-serie-o',
  'oliva-serie-o-petit-corona',
  'oliva-serie-v-club-20',
  'oliva-serie-v-melanio-no4',
  'partagas-serie-puritos',
  'punch-mini-20-tin',
  'rocky-patel-disciple-half-corona',
  'rocky-patel-sun-grown-maduro-lancero-half',
  'rocky-patel-sun-grown-torpedo',
  'romeo-y-julieta-mini-10',
  'romeo-y-julieta-petit-julieta',
  'romeo-y-julieta-puritos',
  'tatiana-dolce-vanilla',
  'montecristo-short',
  'oliva-serie-g-maduro-special-g'
];

test('read-only current live archive/image state for reconstruction', async () => {
  const response = await fetch(`${BASE}/api/catalogue-overrides?diag=reconstruct-${Date.now()}`, {
    headers:{ accept:'application/json' }, cache:'no-store'
  });
  assert.equal(response.ok, true);
  const state = await response.json();
  const rows = HISTORICAL_ARCHIVED.map(key => ({
    key,
    entry: state.entries?.[key] ? {
      brand:state.entries[key].brand,
      title:state.entries[key].title,
      archived:state.entries[key].archived,
      archivedRank:state.entries[key].archivedRank,
      rank:state.entries[key].rank,
      imageUrl:state.entries[key].imageUrl,
      imageSourceKey:state.entries[key].imageSourceKey,
      imageVersion:state.entries[key].imageVersion
    } : null,
    card: state.cards?.[key] ? {
      brand:state.cards[key].brand,
      title:state.cards[key].title,
      archived:state.cards[key].archived,
      archivedRank:state.cards[key].archivedRank,
      rank:state.cards[key].rank,
      catalogueType:state.cards[key].catalogueType,
      imageUrl:state.cards[key].imageUrl
    } : null
  }));
  const oliva = Object.entries(state.entries || {}).filter(([,v]) => v?.brand === 'Oliva').map(([key,v]) => ({key,source:'entry',archived:v.archived,rank:v.rank,archivedRank:v.archivedRank}));
  for (const [key,v] of Object.entries(state.cards || {})) if (v?.brand === 'Oliva' && !oliva.some(row => row.key === key)) oliva.push({key,source:'card',archived:v.archived,rank:v.rank,archivedRank:v.archivedRank});
  console.log('LIVE_RECONSTRUCTION_STATE ' + JSON.stringify({ updatedAt:state.updatedAt, rows, oliva }));
});
