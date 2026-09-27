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
const variantEditorSource = await readFile(new URL('../public/catalogue-variant-editor.mjs', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const scrollStability = await import('../public/catalogue-scroll-stability.mjs');

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
  assert.match(loaderSource, /catalogue-direct-edit\.mjs\?v=scroll-stability-1/);
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
  assert.match(loaderSource, /import\('\.\/catalogue-editor-behaviour\.mjs\?v=scroll-stability-1'\)/);
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


test('reload startup disables native scroll restoration and forces the page to the top early', () => {
  const startup = indexSource.indexOf("history.scrollRestoration = 'manual'");
  const stylesheet = indexSource.indexOf('<link rel="stylesheet"');
  assert.ok(startup > 0, 'scroll restoration must be disabled in the HTML shell');
  assert.ok(stylesheet > startup, 'the top-of-page guard must run before stylesheet/runtime hydration');
  assert.match(indexSource, /window\.addEventListener\('pageshow', startAtTop\)/);
  assert.match(indexSource, /window\.addEventListener\('load', startAtTop/);
});

test('viewport restoration follows the same visible card when layout above it changes', () => {
  let cardTop = 120;
  let lastScroll = null;
  const card = {
    dataset:{ key:'anchor-card' },
    getBoundingClientRect(){ return { top:cardTop, bottom:cardTop + 420 }; }
  };
  const view = {
    scrollX:4,
    scrollY:900,
    innerHeight:700,
    scrollTo(value){ lastScroll = value; },
    requestAnimationFrame(callback){ callback(); }
  };
  const root = {
    defaultView:view,
    documentElement:{ style:{} },
    querySelectorAll(){ return [card]; }
  };
  const snapshot = scrollStability.captureViewport(root);
  assert.equal(snapshot.anchorKey, 'anchor-card');
  assert.equal(snapshot.anchorTop, 120);
  cardTop = 260;
  scrollStability.restoreViewport(snapshot, root);
  assert.equal(lastScroll.left, 4);
  assert.equal(lastScroll.top, 1040);
});

test('edit catalogue, variant editing and save paths explicitly preserve the page viewport', () => {
  assert.match(behaviourSource, /captureViewport\(root\)[\s\S]*closePublicDiagnostics\(root\)[\s\S]*restoreViewportAfterLayout\(viewport, root\)/);
  assert.match(directEditSource, /function enterEditMode\(\)[\s\S]*captureViewport\(\)[\s\S]*restoreViewportAfterLayout\(viewport\)/);
  assert.match(directEditSource, /async function saveSelected\(\)[\s\S]*captureViewport\(\)[\s\S]*restoreViewportAfterLayout\(viewport\)/);
  assert.match(variantEditorSource, /async function openEditor\(card, kind\)[\s\S]*captureViewport\(\)[\s\S]*restoreViewportAfterLayout\(viewport\)/);
  assert.match(variantEditorSource, /async function saveEditor\(event\)[\s\S]*captureViewport\(\)[\s\S]*apply(?:Blend|Variant)ToCard[\s\S]*restoreViewportAfterLayout\(viewport\)/);
  assert.match(fullEditorSource, /async function saveUnified\(\)[\s\S]*captureViewport\(\)[\s\S]*loadStateForBrowser[\s\S]*closeEditor\(\)[\s\S]*restoreViewportAfterLayout\(viewport\)/);
});
