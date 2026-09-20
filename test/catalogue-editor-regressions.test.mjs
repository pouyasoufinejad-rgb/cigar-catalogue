import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let behaviour = null;
let admin = null;
try {
  behaviour = await import('../public/catalogue-editor-behaviour.mjs');
  admin = await import('../public/catalogue-admin-unified-v139.mjs');
} catch (_) {
  behaviour = null;
  admin = null;
}
const loaderSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const behaviourSource = await readFile(new URL('../public/catalogue-editor-behaviour.mjs', import.meta.url), 'utf8').catch(() => '');
const directEditSource = await readFile(new URL('../public/catalogue-direct-edit.mjs', import.meta.url), 'utf8');
const fullEditorSource = await readFile(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');

test('Half-Cigar remains selected when legacy editor code programmatically writes Recommendation', () => {
  assert.ok(behaviour, 'catalogue editor behaviour module must load');
  assert.equal(behaviour.normaliseCatalogueType('half'), 'half');
  assert.equal(behaviour.preferredProgrammaticCatalogueType('main', 'half', ''), 'half');
  assert.equal(behaviour.preferredProgrammaticCatalogueType('main', 'half', 'main'), 'main');
  assert.equal(behaviour.preferredProgrammaticCatalogueType('taster', 'half', ''), 'taster');
});

test('Half-Cigar membership resolves from explicit card data before legacy taster state', () => {
  assert.ok(behaviour, 'catalogue editor behaviour module must load');
  const card = { dataset: { key: 'half-one', catalogueType: 'half', taster: '' } };
  assert.equal(behaviour.resolveCardCatalogueType(card), 'half');
  assert.equal(behaviour.resolveCardCatalogueType({ dataset: { key: 'taster-one', taster: '1' } }), 'taster');
  assert.equal(behaviour.resolveCardCatalogueType({ dataset: { key: 'main-one' } }), 'main');
});

test('opening the full catalogue editor resets its scroll container to the top', () => {
  assert.ok(behaviour, 'catalogue editor behaviour module must load');
  const panel = { scrollTop: 732 };
  const modal = { querySelector: selector => selector === '.catalogue-admin-panel' ? panel : null };
  behaviour.resetAdminEditorScroll(modal);
  assert.equal(panel.scrollTop, 0);
});

test('public Legend and Benchmarks disclosures are closed when editing starts', () => {
  assert.ok(behaviour, 'catalogue editor behaviour module must load');
  const sections = [
    { open: true, removeAttribute(name) { if (name === 'open') this.removed = true; } },
    { open: true, removeAttribute(name) { if (name === 'open') this.removed = true; } }
  ];
  behaviour.closePublicDiagnostics({ querySelectorAll: () => sections });
  assert.deepEqual(sections.map(section => section.open), [false, false]);
  assert.deepEqual(sections.map(section => section.removed), [true, true]);
});

test('edit click is observed at window capture before direct edit can stop document propagation', () => {
  assert.match(behaviourSource, /const clickTarget = root\.defaultView \|\| root/);
  assert.match(behaviourSource, /clickTarget\.addEventListener\?\.\('click',[\s\S]*?true\)/);
});

test('Edit catalogue is owned by direct edit while the full editor remains bound for More fields', () => {
  assert.match(loaderSource, /catalogue-direct-edit\.mjs\?v=variant-edit-1/);
  assert.match(directEditSource, /function onToggleCapture\(event\)[\s\S]*?event\.stopImmediatePropagation\(\)/);
  assert.match(directEditSource, /function openMoreFields\(\)[\s\S]*?allowModalOpen = true;[\s\S]*?catalogue-admin-toggle/);
  assert.match(fullEditorSource, /q\('catalogue-admin-toggle'\)\?\.addEventListener\('click', openEditor\)/);
});

test('Legend and Benchmarks full-editor fields are converted to explicit collapsed disclosures', () => {
  assert.ok(behaviour, 'catalogue editor behaviour module must load');
  assert.equal(typeof behaviour.configureGlobalSectionEditors, 'function');
  assert.equal(typeof behaviour.closeGlobalSectionEditors, 'function');
  assert.deepEqual(behaviour.GLOBAL_SECTION_EDITORS.map(item => [item.id, item.label]), [
    ['catalogue-admin-legend', 'Legend & scoring guide'],
    ['catalogue-admin-benchmarks', 'Benchmarks']
  ]);
});

test('browser module chain loads the catalogue editor behaviour guard', () => {
  assert.match(loaderSource, /import\('\.\/catalogue-editor-behaviour\.mjs'\)/);
});


test('archived cards are rehomed into the Archived grid and restored out of it on unarchive', () => {
  assert.ok(admin, 'catalogue admin module must load');
  assert.equal(typeof admin.rehomeCardForSavedState, 'function');

  const flat = {
    id:'flat-main',
    appendChild(card) { card.parentElement = this; }
  };
  const archived = {
    id:'archived-cards',
    appendChild(card) { card.parentElement = this; }
  };
  const root = {
    getElementById(id) {
      if (id === 'flat-main') return flat;
      if (id === 'archived-cards') return archived;
      return null;
    },
    querySelector() { return flat; }
  };
  const card = {
    dataset:{ archived:'1' },
    parentElement:flat,
    closest(selector) {
      return selector === '#archived-section' && this.parentElement === archived ? { id:'archived-section' } : null;
    }
  };

  admin.rehomeCardForSavedState(card, { archived:true, catalogueType:'main' }, root);
  assert.equal(card.parentElement, archived);

  delete card.dataset.archived;
  admin.rehomeCardForSavedState(card, { archived:false, catalogueType:'main' }, root);
  assert.equal(card.parentElement, flat);
});
