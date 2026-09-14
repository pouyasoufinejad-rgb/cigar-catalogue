import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { prepareV4StructuralPayload } from '../public/catalogue-structure-editor.mjs';
import { stripLegacyRecommendationRanks } from '../public/catalogue-recommendation-subsections.mjs';

const rendererSource = await readFile(new URL('../public/catalogue-recommendation-subsections.mjs', import.meta.url), 'utf8');

const subsections = [
  { id: 'coronets', name: 'Coronets', description: 'Compact premium cigars.', entryKeys: ['a', 'b'] },
  { id: 'petit-panatelas', name: 'Petit Panatelas', description: 'Slim small formats.', entryKeys: ['c'] }
];

const persistedState = {
  version: 4,
  cards: {
    a: { catalogueType: 'main', quality: 9 },
    b: { catalogueType: 'main', quality: 8 },
    c: { catalogueType: 'main', quality: 7 }
  },
  entries: {},
  recommendationSubsections: subsections
};

const rows = [
  { key: 'a', catalogueType: 'main', archived: false },
  { key: 'b', catalogueType: 'main', archived: false },
  { key: 'c', catalogueType: 'main', archived: false }
];

test('v4 Recommendation reorder removes legacy global main ranks while preserving unrelated fields', () => {
  const structured = prepareV4StructuralPayload({
    payload: {
      version: 3,
      cards: {
        a: { rank: 41, quality: 9, eyebrow: 'Keep A' },
        b: { rank: 42, quality: 8, eyebrow: 'Keep B' },
        c: { rank: 43, quality: 7, eyebrow: 'Keep C' }
      },
      sections: {}
    },
    persistedState,
    rows,
    key: 'b',
    targetType: 'main',
    targetSubsectionId: 'coronets',
    targetPosition: 1,
    wantsArchived: false,
    now: '2026-09-14T10:00:00Z'
  });
  const payload = stripLegacyRecommendationRanks(structured);

  assert.deepEqual(payload.recommendationSubsections[0].entryKeys, ['b', 'a']);
  assert.deepEqual(payload.recommendationSubsections[1].entryKeys, ['c']);
  for (const key of ['a', 'b', 'c']) {
    assert.equal(Object.hasOwn(payload.cards[key], 'rank'), false, `${key} must not retain a global Recommendation rank`);
  }
  assert.equal(payload.cards.a.quality, 9);
  assert.equal(payload.cards.a.eyebrow, 'Keep A');
  assert.equal(payload.cards.b.eyebrow, 'Keep B');
  assert.equal(payload.cards.c.eyebrow, 'Keep C');
});

test('Recommendation subsection headings reuse the established section-head typography instead of custom fonts and colours', () => {
  assert.match(rendererSource, /className\s*=\s*['"][^'"]*section-head[^'"]*['"]/);
  assert.match(rendererSource, /createElement\(['"]h2['"]\)/);
  assert.doesNotMatch(rendererSource, /recommendation-subsection-head h3[^}]*Georgia/s);
  assert.doesNotMatch(rendererSource, /recommendation-subsection-head p[^}]*system-ui/s);
});

test('first Recommendation hydration explicitly restores a clean page load to the top', () => {
  assert.match(rendererSource, /scrollRestoration/);
  assert.match(rendererSource, /scrollTo\s*\(/);
  assert.match(rendererSource, /location\?\.hash|location\.hash/);
});
