import test from 'node:test';
import assert from 'node:assert/strict';

const LIVE_STATE = 'https://cigar-catalogue.psncodex.workers.dev/api/catalogue-overrides';

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
    archived: entry.archived
  }));
  const cards = Object.entries(state.cards || {}).map(([key, card]) => ({
    key,
    imageUrl: card.imageUrl,
    imageSourceKey: card.imageSourceKey,
    imageVersion: card.imageVersion,
    img: card.img,
    image: card.image,
    archived: card.archived
  })).filter(card => card.imageUrl || card.imageSourceKey || card.imageVersion || card.img || card.image || card.archived);
  console.log('LIVE_STATE_UPDATED_AT', state.updatedAt);
  console.log('LIVE_COUNTS', JSON.stringify({ entries:entries.length, cards:Object.keys(state.cards || {}).length, sections:Object.keys(state.sections || {}).length }));
  console.log('LIVE_ENTRIES_IMAGE_SUMMARY', JSON.stringify(entries));
  console.log('LIVE_CARD_IMAGE_OVERRIDES', JSON.stringify(cards));
});
