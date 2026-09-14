import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  shouldResetInitialScroll,
  resolveEditableField,
  sectionPlanForRows,
  inspectorFieldsForTarget,
  buildDraftSavePayload
} from '../public/catalogue-next-ui.mjs';

const source = await readFile(new URL('../public/catalogue-next-ui.mjs', import.meta.url), 'utf8');

test('new UI keeps the existing top artwork/header instead of replacing the document body', () => {
  assert.doesNotMatch(source, /document\.body\.innerHTML\s*=/);
  assert.doesNotMatch(source, /document\.body\.replaceChildren/);
  assert.match(source, /findCatalogueMountAnchor/);
  assert.match(source, /catalogue-next-root/);
});

test('initial scroll reset occurs only for normal no-hash loads', () => {
  assert.equal(shouldResetInitialScroll({ hash: '' }), true);
  assert.equal(shouldResetInitialScroll({ hash: '#catalogue-next-tasters' }), false);
});

test('section plan preserves explicit Recommendation subsection order and separates Half-Cigar/Taster', () => {
  const state = {
    version: 4,
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: 'Tin-friendly small formats.', entryKeys: ['joya-black', 'm81'] },
      { id: 'petit-panatelas', name: 'Petit Panatelas', description: '', entryKeys: ['lp9'] },
      { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: ['isla'] }
    ]
  };
  const rows = [
    { key: 'joya-black', catalogueType: 'main', archived: false, stock: 'in' },
    { key: 'm81', catalogueType: 'main', archived: false, stock: 'in' },
    { key: 'lp9', catalogueType: 'main', archived: false, stock: 'in' },
    { key: 'isla', catalogueType: 'main', archived: false, stock: 'in' },
    { key: 'half', catalogueType: 'half', rank: 1, archived: false, stock: 'in' },
    { key: 'taster', catalogueType: 'taster', rank: 1, archived: false, stock: 'in' }
  ];
  const plan = sectionPlanForRows(rows, state);
  assert.deepEqual(plan.recommendations.map(section => section.id), ['coronets', 'petit-panatelas', 'flavoured']);
  assert.deepEqual(plan.recommendations[0].keys, ['joya-black', 'm81']);
  assert.deepEqual(plan.half, ['half']);
  assert.deepEqual(plan.tasters, ['taster']);
});

test('master editor maps clicked elements to contextual fields and treats Value as derived', () => {
  assert.equal(resolveEditableField({ field: 'eyebrow' }), 'eyebrow');
  assert.equal(resolveEditableField({ field: 'rank' }), 'rank');
  assert.equal(resolveEditableField({ field: 'value' }), 'value');
  const valueFields = inspectorFieldsForTarget('value');
  assert.equal(valueFields.some(field => field.name === 'value' && !field.readOnly), false);
  assert.equal(valueFields.some(field => field.name === 'price'), true);
  assert.equal(valueFields.some(field => field.name === 'quality'), true);
});

test('full-card inspector covers every catalogue-owned editable product field', () => {
  const names = inspectorFieldsForTarget('card').map(field => field.name);
  for (const required of [
    'brand','title','eyebrow','summaryHtml','noteHtml','packagePrice','packageLabel','price','country','length','ring',
    'strength','quality','risk','stockPin','catalogueType','retailerLinks','smokeTime','experienceTags','productionHtml','practicalHtml','archived'
  ]) assert.ok(names.includes(required), `missing ${required}`);
  assert.equal(names.includes('value'), false, 'Value is derived and must not be directly writable');
});

test('draft save payload preserves v4 Recommendation structure and unrelated state fields', () => {
  const state = {
    version: 4,
    updatedAt: 'old',
    cards: { a: { eyebrow: 'Keep', quality: 8 }, b: { rank: 2 } },
    entries: { dyn: { brand: 'Dynamic' } },
    sections: { benchmarksHtml: '<details>Keep</details>', extra: { keep: true } },
    recommendationSubsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] }]
  };
  const payload = buildDraftSavePayload(state, state);
  assert.equal(payload.version, 4);
  assert.deepEqual(payload.cards, state.cards);
  assert.deepEqual(payload.entries, state.entries);
  assert.deepEqual(payload.sections, state.sections);
  assert.deepEqual(payload.recommendationSubsections, state.recommendationSubsections);
});

test('source contains one master Edit Catalogue control, brand explorer and staged edit bar', () => {
  assert.match(source, /Edit Catalogue/);
  assert.match(source, /catalogue-next-brand-explorer/);
  assert.match(source, /catalogue-next-edit-bar/);
  assert.match(source, /Save Changes/);
  assert.match(source, /Discard/);
  assert.match(source, /Undo/);
});
