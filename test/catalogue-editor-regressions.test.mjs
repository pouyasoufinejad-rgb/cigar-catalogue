import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const admin = await import('../public/catalogue-admin-unified-v139.mjs');
const adminSource = await readFile(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');
const directEditSource = await readFile(new URL('../public/catalogue-direct-edit.mjs', import.meta.url), 'utf8');

test('unified editor natively preserves Half-Cigar as a catalogue type', () => {
  assert.equal(typeof admin.normaliseCatalogueType, 'function');
  assert.equal(admin.normaliseCatalogueType('half'), 'half');

  const structural = admin.buildStructuralOverride({
    catalogueType: 'half',
    taster: false,
    retailerText: ''
  });
  assert.equal(structural.catalogueType, 'half');
  assert.equal(structural.taster, false);

  assert.match(adminSource, /<option value=\"half\">Half-Cigar<\/option>/);
  assert.match(adminSource, /setField\('catalogue-v139-type',\s*data\.catalogueType\)/);
  assert.doesNotMatch(adminSource, /setField\('catalogue-v139-type',\s*data\.taster\s*\?\s*'taster'\s*:\s*'main'\)/);
});

test('dynamic entry save plan keeps explicit Half-Cigar membership', () => {
  const structural = admin.buildStructuralOverride({
    catalogueType: 'half',
    taster: false,
    brand: 'Drew Estate',
    title: 'Factory Smokes Sweet Toro — Single',
    retailerText: ''
  });
  const editorial = admin.buildEditorialOverride({ rank: 3, strength: 4, quality: 5, size: 'bronze' });
  const plan = admin.buildSavePlan({
    state: { cards: {}, sections: {}, entries: {} },
    key: 'drew-estate-factory-smokes-sweet-toro',
    dynamic: true,
    structural,
    editorial,
    sections: {}
  });
  assert.equal(plan.statePayload.cards['drew-estate-factory-smokes-sweet-toro'].catalogueType, 'half');
  assert.equal(plan.entryPayload.catalogueType, 'half');
});

test('opening the full catalogue editor resets its scroll container to the top', () => {
  assert.equal(typeof admin.resetAdminEditorScroll, 'function');
  const panel = { scrollTop: 732 };
  const modal = { querySelector: selector => selector === '.catalogue-admin-panel' ? panel : null };
  admin.resetAdminEditorScroll(modal);
  assert.equal(panel.scrollTop, 0);
  assert.match(adminSource, /function openEditor\(\)[\s\S]*?resetAdminEditorScroll\(modal\)/);
});

test('Legend and Benchmarks editors are collapsed until explicitly opened', () => {
  assert.equal(typeof admin.configureGlobalSectionEditors, 'function');
  assert.match(adminSource, /catalogue-admin-global-section/);
  assert.match(adminSource, /Legend & scoring guide/);
  assert.match(adminSource, /Benchmarks/);
  assert.match(adminSource, /function openEditor\(\)[\s\S]*?closeGlobalSectionEditors/);
});

test('direct edit entry explicitly closes public Legend and Benchmarks disclosures', () => {
  assert.match(directEditSource, /section\.open\s*=\s*false/);
  assert.match(directEditSource, /querySelectorAll\('\.legend-dropdown, #test-impact-map'\)/);
  assert.match(directEditSource, /function enterEditMode\(\)[\s\S]*?closeDiagnosticSections\(\)/);
});
