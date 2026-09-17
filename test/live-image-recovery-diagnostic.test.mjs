import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const CANDIDATES = [
  'el-rey-del-mundo-demi-tasse',
  'hoyo-de-monterrey-le-hoyo-du-maire',
  'romeo-y-julieta-petit-julieta',
  'liga-privada-h99-coronets',
  'liga-privada-10-seleccion-de-mercado-coronets',
  'undercrown-10-coronets',
  'liga-privada-unico-nasty-fritas',
  'undercrown-10-corona-viva',
  'liga-privada-h99-papas-fritas',
  'la-flor-dominicana-reserva-especial-el-jocko-maduro',
  'la-flor-dominicana-la-nox-petit',
  'my-father-la-gran-oferta-lancero',
  'my-father-no-4-lancero',
  'foundation-charter-oak-maduro-rothschild',
  'paradiso-quintessence-robusto',
  'ashton-vsg-enchantment',
  'paradiso-elegancia-corona',
  'drew-estate-acid-krush-red-cameroon'
];

test('report recoverable KV image blobs without writing production', async () => {
  const rows = [];
  for (const key of CANDIDATES) {
    const response = await fetch(`${BASE}/api/catalogue-image/${key}?diag=${Date.now()}`, { method:'HEAD' });
    rows.push({ key, status:response.status, type:response.headers.get('content-type') || '' });
  }
  console.log('IMAGE_BLOB_STATUS', JSON.stringify(rows));
  assert.ok(rows.every(row => [200, 404].includes(row.status)));
});

test('report current affected live entry fields without writing production', async () => {
  const response = await fetch(`${BASE}/api/catalogue-overrides?diag=${Date.now()}`, { headers:{ accept:'application/json' } });
  assert.equal(response.ok, true);
  const state = await response.json();
  const rows = Object.values(state.entries || {})
    .filter(entry => CANDIDATES.includes(entry.key) || entry.catalogueType || entry.archived || entry.archivedRank)
    .map(entry => ({
      key:entry.key,
      rank:entry.rank,
      taster:entry.taster,
      archived:entry.archived,
      archivedAt:entry.archivedAt,
      archivedRank:entry.archivedRank,
      catalogueType:entry.catalogueType,
      imageUrl:entry.imageUrl,
      imageSourceKey:entry.imageSourceKey,
      imageVersion:entry.imageVersion,
      title:entry.title
    }));
  console.log('AFFECTED_ENTRY_STATUS', JSON.stringify(rows));
});
