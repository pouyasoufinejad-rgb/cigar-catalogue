import test from 'node:test';
import assert from 'node:assert/strict';

const LIVE_ORIGIN = 'https://cigar-catalogue.psncodex.workers.dev';
const LIVE_STATE = `${LIVE_ORIGIN}/api/catalogue-overrides`;

const ACTIVE_BLANK_IMAGE_KEYS = [
  'liga-privada-h99-coronets',
  'liga-privada-10-seleccion-de-mercado-coronets',
  'undercrown-10-coronets',
  'liga-privada-unico-nasty-fritas',
  'undercrown-10-corona-viva',
  'liga-privada-h99-papas-fritas',
  'la-flor-dominicana-reserva-especial-el-jocko-maduro',
  'la-flor-dominicana-la-nox-petit',
  'my-father-la-gran-oferta-lancero',
  'foundation-charter-oak-maduro-rothschild',
  'paradiso-quintessence-robusto',
  'ashton-vsg-enchantment',
  'drew-estate-acid-krush-red-cameroon'
];

const ARCHIVE_CHECKPOINT_KEYS = [
  'montecristo-short',
  'oliva-serie-g-maduro-special-g'
];

test('diagnose production catalogue state without writing it', async () => {
  const response = await fetch(`${LIVE_STATE}?diag=${Date.now()}`, { headers:{ accept:'application/json' } });
  assert.equal(response.ok, true, `live state HTTP ${response.status}`);
  const state = await response.json();
  const entries = Object.values(state.entries || {}).map(entry => ({
    key: entry.key,
    brand: entry.brand,
    title: entry.title,
    imageUrl: entry.imageUrl,
    imageSourceKey: entry.imageSourceKey,
    imageVersion: entry.imageVersion,
    archived: entry.archived,
    archivedAt: entry.archivedAt,
    catalogueType: entry.catalogueType,
    archivedRank: entry.archivedRank
  }));
  const cards = Object.entries(state.cards || {}).map(([key, card]) => ({
    key,
    imageUrl: card.imageUrl,
    imageSourceKey: card.imageSourceKey,
    imageVersion: card.imageVersion,
    img: card.img,
    image: card.image,
    archived: card.archived,
    archivedAt: card.archivedAt,
    catalogueType: card.catalogueType,
    archivedRank: card.archivedRank
  })).filter(card => card.imageUrl || card.imageSourceKey || card.imageVersion || card.img || card.image || card.archived || card.catalogueType || card.archivedRank);

  const imageProbes = [];
  for (const key of ACTIVE_BLANK_IMAGE_KEYS) {
    const imageResponse = await fetch(`${LIVE_ORIGIN}/api/catalogue-image/${key}?diag=${Date.now()}`, { cache:'no-store' });
    const bytes = imageResponse.ok ? (await imageResponse.arrayBuffer()).byteLength : 0;
    imageProbes.push({
      key,
      status:imageResponse.status,
      contentType:imageResponse.headers.get('content-type'),
      bytes
    });
  }

  const archiveCheckpoint = Object.fromEntries(ARCHIVE_CHECKPOINT_KEYS.map(key => [key, {
    card: state.cards?.[key] || null,
    entry: state.entries?.[key] || null
  }]));

  console.log('LIVE_STATE_UPDATED_AT', state.updatedAt);
  console.log('LIVE_COUNTS', JSON.stringify({ entries:entries.length, cards:Object.keys(state.cards || {}).length, sections:Object.keys(state.sections || {}).length }));
  console.log('LIVE_ENTRIES_IMAGE_SUMMARY', JSON.stringify(entries));
  console.log('LIVE_CARD_IMAGE_OVERRIDES', JSON.stringify(cards));
  console.log('LIVE_BLANK_IMAGE_BLOB_PROBES', JSON.stringify(imageProbes));
  console.log('LIVE_ARCHIVE_CHECKPOINT_PROBES', JSON.stringify(archiveCheckpoint));
});
