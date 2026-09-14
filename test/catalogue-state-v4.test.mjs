import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseState,
  mergeState,
  hasMeaningfulState,
  handleState,
  handleEntry
} from '../src/index.js';

const subsections = [
  { id: 'coronets', name: 'Coronets', description: 'Small formats', entryKeys: ['a'] },
  { id: 'petit-panatelas', name: 'Petit Panatelas', description: 'Larger slim formats', entryKeys: [] }
];

function stateV4(overrides = {}) {
  return {
    version: 4,
    cards: { a: { catalogueType: 'main', quality: 8 } },
    sections: {},
    entries: {},
    recommendationSubsections: subsections,
    ...overrides
  };
}

function kvWith(initialState) {
  let state = initialState ? JSON.stringify(initialState) : null;
  const puts = [];
  const deletes = [];
  return {
    puts,
    deletes,
    async get(key) {
      if (key === 'catalogue-overrides') return state;
      return null;
    },
    async put(key, value) {
      puts.push({ key, value });
      if (key === 'catalogue-overrides') state = value;
    },
    async delete(key) {
      deletes.push(key);
    },
    read() {
      return state ? JSON.parse(state) : null;
    }
  };
}

test('v3 remains v3 until explicit subsection state is supplied', () => {
  const state = normaliseState({ version: 3, cards: {}, sections: {}, entries: {} });
  assert.equal(state.version, 3);
  assert.equal(Object.hasOwn(state, 'recommendationSubsections'), false);
});

test('v4 round-trips explicit Recommendation subsection state', () => {
  const source = stateV4();
  const state = normaliseState(source);
  assert.equal(state.version, 4);
  assert.deepEqual(state.recommendationSubsections, subsections);
});

test('ordinary merge into v4 preserves explicit subsection state when incoming payload omits it', () => {
  const merged = mergeState(stateV4(), {
    cards: { a: { catalogueType: 'main', quality: 9 } }
  });
  assert.equal(merged.version, 4);
  assert.deepEqual(merged.recommendationSubsections, subsections);
  assert.equal(merged.cards.a.quality, 9);
});

test('explicit incoming subsection state replaces and validates the v4 structure', () => {
  const replacement = [
    { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: ['a'] }
  ];
  const merged = mergeState(stateV4(), { recommendationSubsections: replacement });
  assert.equal(merged.version, 4);
  assert.deepEqual(merged.recommendationSubsections, replacement);
});

test('malformed explicit subsection state is rejected rather than discarded', () => {
  assert.throws(() => normaliseState(stateV4({
    recommendationSubsections: [
      { id: 'one', name: 'One', description: '', entryKeys: ['a'] },
      { id: 'two', name: 'Two', description: '', entryKeys: ['a'] }
    ]
  })), /duplicate.*a/i);
});

test('subsection-only v4 state counts as meaningful persisted state', () => {
  assert.equal(hasMeaningfulState({
    version: 4,
    cards: {},
    sections: {},
    entries: {},
    recommendationSubsections: [
      { id: 'empty', name: 'Empty', description: '', entryKeys: [] }
    ]
  }), true);
});

test('state PUT rejects invalid v4 subsection membership before writing KV', async () => {
  const kv = kvWith(stateV4());
  const request = new Request('https://catalogue.test/api/catalogue-overrides', {
    method: 'PUT',
    headers: {
      authorization: 'Bearer secret',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      version: 4,
      recommendationSubsections: [
        { id: 'one', name: 'One', description: '', entryKeys: ['a'] },
        { id: 'two', name: 'Two', description: '', entryKeys: ['a'] }
      ]
    })
  });

  const response = await handleState(request, { CATALOGUE_STATE: kv, ADMIN_TOKEN: 'secret' });
  assert.equal(response.status, 400);
  assert.equal(kv.puts.length, 0);
  const payload = await response.json();
  assert.match(payload.error, /duplicate.*a/i);
});

test('valid v4 state PUT returns version 4 and preserves subsection arrays', async () => {
  const kv = kvWith(stateV4());
  const request = new Request('https://catalogue.test/api/catalogue-overrides', {
    method: 'PUT',
    headers: {
      authorization: 'Bearer secret',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      cards: { a: { catalogueType: 'main', quality: 9 } }
    })
  });

  const response = await handleState(request, { CATALOGUE_STATE: kv, ADMIN_TOKEN: 'secret' });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.version, 4);
  assert.deepEqual(kv.read().recommendationSubsections, subsections);
});

test('entry deletion from v4 removes dangling Recommendation membership without downgrading state', async () => {
  const kv = kvWith(stateV4({
    cards: { a: { catalogueType: 'main' }, b: { catalogueType: 'main' } },
    entries: {
      a: {
        key: 'a', brand: 'Brand', title: 'A', eyebrow: 'A', packagePrice: 10,
        packageLabel: 'single cigar', price: 10, length: 4, ring: 34,
        country: 'Nicaragua', strength: 7, quality: 8, size: 'gold', risk: 1,
        stock: 'in', stockPin: '', rank: 1, taster: false, archived: false,
        archivedAt: '', experienceTags: [], summaryHtml: '', noteHtml: '',
        productionLines: [], practicalLines: [], smokeTime: '', retailerLinks: [],
        imageUrl: '', imageSourceKey: '', imageVersion: 0, priceChecked: '', stockChecked: ''
      }
    },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a', 'b'] }
    ]
  }));

  const request = new Request('https://catalogue.test/api/catalogue-entry/a', {
    method: 'DELETE',
    headers: { authorization: 'Bearer secret' }
  });
  const response = await handleEntry(request, { CATALOGUE_STATE: kv, ADMIN_TOKEN: 'secret' }, 'a');
  assert.equal(response.status, 200);
  const saved = kv.read();
  assert.equal(saved.version, 4);
  assert.deepEqual(saved.recommendationSubsections[0].entryKeys, ['b']);
  assert.equal(Object.hasOwn(saved.cards, 'a'), false);
  assert.equal(Object.hasOwn(saved.entries, 'a'), false);
});
