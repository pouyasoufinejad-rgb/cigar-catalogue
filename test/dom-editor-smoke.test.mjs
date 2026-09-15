import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const INDEX_URL = new URL('../public/index.html', import.meta.url);
const RUNTIME_URL = new URL('../public/catalogue-runtime.mjs', import.meta.url);
const ADMIN_URL = new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url);
const DEFAULT_SECTIONS = [
  { id:'coronets-cigarillos', title:'Coronets & Cigarillos', note:'Ring gauge 34 and under.' },
  { id:'petit-panatelas', title:'Petit Panatelas', note:'Ring gauge 35 and over.' },
  { id:'flavoured-infused', title:'Flavoured & Infused Cigars', note:'Sweetened, aromatic and infused profiles.' }
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(predicate, message, timeout = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = predicate();
    if (value) return value;
    await delay(10);
  }
  throw new Error(message);
}

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type':'application/json' }
  });
}

function activeMainCards(document) {
  return Array.from(document.querySelectorAll('#cards article.card[data-key]')).filter(card => {
    if (card.dataset.archived === '1' || card.closest('#archived-section')) return false;
    if (card.dataset.taster === '1' || card.closest('#tasters-section')) return false;
    const type = String(card.dataset.catalogueType || '').toLowerCase();
    return !['half', 'half-cigar', 'halfcigar', 'taster'].includes(type);
  });
}

function buildStateFromDom(document) {
  const cards = activeMainCards(document);
  assert.ok(cards.length >= 6, 'fixture should contain enough main recommendation cards');
  const sections = DEFAULT_SECTIONS.map(section => ({ ...section, entryKeys:[] }));

  const existing = new Map(Array.from(document.querySelectorAll('#cards [data-recommendation-subsection]')).map(block => [block.dataset.recommendationSubsection, block]));
  const assigned = new Set();
  for (const section of sections) {
    const block = existing.get(section.id);
    for (const card of Array.from(block?.querySelectorAll?.('article.card[data-key]') || [])) {
      if (!cards.includes(card) || assigned.has(card.dataset.key)) continue;
      section.entryKeys.push(card.dataset.key);
      assigned.add(card.dataset.key);
    }
  }

  for (const card of cards) {
    if (assigned.has(card.dataset.key)) continue;
    sections.reduce((smallest, section) => section.entryKeys.length < smallest.entryKeys.length ? section : smallest, sections[0]).entryKeys.push(card.dataset.key);
    assigned.add(card.dataset.key);
  }

  for (let index = 0; index < sections.length; index += 1) {
    if (sections[index].entryKeys.length) continue;
    const donor = sections.find(section => section.entryKeys.length > 1);
    assert.ok(donor, 'fixture should allow all three recommendation subsections to contain cards');
    sections[index].entryKeys.push(donor.entryKeys.pop());
  }

  const stateCards = {};
  sections.forEach(section => {
    section.entryKeys.forEach((key, index) => {
      stateCards[key] = { rank:index + 1, subsection:section.id };
    });
  });
  return {
    version:3,
    cards:stateCards,
    sections:{ recommendationSubsections:sections },
    entries:{}
  };
}

function installGlobals(window) {
  const names = ['window', 'document', 'MutationObserver', 'Event', 'CustomEvent', 'Node', 'Element', 'HTMLElement', 'localStorage', 'sessionStorage', 'location', 'navigator', 'CSS'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      configurable:true,
      writable:true,
      value:window[name]
    });
  }
  return () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

async function importRuntimeModules(runtimeSource) {
  const specs = Array.from(runtimeSource.matchAll(/import\(['"]([^'"]+)['"]\)/g), match => match[1]);
  assert.ok(specs.length >= 10, 'runtime module list should be discoverable');
  const modules = new Map();
  for (const spec of specs) {
    const url = new URL(spec, RUNTIME_URL);
    url.searchParams.set('dom-smoke', '1');
    modules.set(spec, await import(url.href));
  }
  return modules;
}

function sectionLengthFor(state, id) {
  return state.sections.recommendationSubsections.find(section => section.id === id)?.entryKeys.length || 0;
}

function mutationOwner(record) {
  const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
  if (!target?.closest) return 'unattributed';
  if (target.closest('.value-calc')) return 'catalogue-flavour / refreshAllValueDisplays';
  if (target.closest('.rating,.medals')) return 'catalogue-flavour / catalogue-size-presentation';
  if (target.closest('.artframe,.artmeta-left,.artmeta-right,.artmeta-bottom')) return 'catalogue-size-presentation / catalogue-presentation';
  if (target.closest('.convenience-controls,[data-convenience]')) return 'catalogue-convenience';
  if (target.closest('.retailer-matrix,.retailer-matrix-wrap')) return 'catalogue-convenience';
  return 'unattributed';
}

test('browser editor smoke: direct editing, subsection bounds and save pipeline work together', async t => {
  const html = await readFile(INDEX_URL, 'utf8');
  const putBodies = [];
  let state = null;

  const fetchStub = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input?.url || '';
    const url = new URL(raw, 'https://catalogue.test/');
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (url.pathname === '/api/catalogue-overrides') {
      if (method === 'PUT') {
        const body = JSON.parse(String(init.body || '{}'));
        putBodies.push(body);
        state = {
          version:3,
          cards:{ ...(body.cards || {}) },
          sections:{ ...(body.sections || {}) },
          entries:{ ...(state?.entries || {}) }
        };
        return responseJson(state);
      }
      return responseJson(state || { version:3, cards:{}, sections:{}, entries:{} });
    }
    if (url.pathname === '/api/stock') return responseJson({ results:{}, updatedAt:null });
    return responseJson({});
  };

  const dom = new JSDOM(html, {
    url:'https://catalogue.test/',
    runScripts:'dangerously',
    pretendToBeVisual:true,
    beforeParse(window) {
      window.fetch = fetchStub;
      window.CSS ||= {};
      window.CSS.escape ||= value => String(value).replace(/[^a-zA-Z0-9_-]/g, char => `\\${char}`);
      window.matchMedia ||= () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      window.ResizeObserver ||= class { observe(){} unobserve(){} disconnect(){} };
      window.IntersectionObserver ||= class { observe(){} unobserve(){} disconnect(){} };
      window.HTMLElement.prototype.scrollIntoView ||= function scrollIntoView() {};
      window.alert = () => {};
      window.confirm = () => true;
      window.prompt = () => 'test-token';
    }
  });
  const { window } = dom;
  const restoreGlobals = installGlobals(window);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  t.after(async () => {
    dom.window.close();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
    globalThis.fetch = previousFetch;
    restoreGlobals();
  });

  if (window.document.readyState === 'loading') {
    await new Promise(resolve => window.addEventListener('DOMContentLoaded', resolve, { once:true }));
  }
  state = buildStateFromDom(window.document);
  window.sessionStorage.setItem('cigar-catalogue-admin-token', 'test-token');

  const adminUrl = new URL(ADMIN_URL);
  adminUrl.searchParams.set('dom-smoke', '1');
  await import(adminUrl.href);
  const runtimeSource = await readFile(RUNTIME_URL, 'utf8');
  const runtimeModules = await importRuntimeModules(runtimeSource);
  const subsectionEntry = Array.from(runtimeModules.entries()).find(([spec]) => spec.includes('catalogue-recommendation-subsections.mjs'));
  assert.ok(subsectionEntry, 'recommendation subsection runtime module must be loaded');
  const subsectionModule = subsectionEntry[1];
  assert.equal(typeof subsectionModule.getRecommendationSubsectionRenderCount, 'function', 'subsection module must expose its render counter for smoke coverage');

  if (window.catalogueOverridesReady) await window.catalogueOverridesReady;
  await waitFor(() => window.document.querySelector('#recommendation-coronets-cigarillos article.card[data-key]'), 'recommendation subsection grids did not hydrate');
  await waitFor(() => window.document.getElementById('catalogue-admin-subsection'), 'subsection editor control did not hydrate');
  await delay(75);

  const toggle = window.document.getElementById('catalogue-admin-toggle');
  assert.ok(toggle, 'Edit catalogue toggle must exist');
  toggle.click();
  assert.ok(window.document.body.classList.contains('catalogue-direct-edit-mode'));
  assert.equal(toggle.textContent.trim(), 'Finish editing');
  t.diagnostic('ASSERTION 1 PASS: Edit catalogue enters direct edit mode and changes the toggle label.');

  const firstCard = window.document.querySelector('[data-recommendation-subsection] .tier-grid article.card[data-key]:not(.hidden)');
  assert.ok(firstCard, 'a visible recommendation card must exist');
  firstCard.dispatchEvent(new window.MouseEvent('click', { bubbles:true, cancelable:true }));
  const selectedCards = window.document.querySelectorAll('article.card.catalogue-direct-selected');
  assert.equal(selectedCards.length, 1);
  assert.equal(selectedCards[0], firstCard);
  assert.ok(firstCard.querySelectorAll('[contenteditable="true"]').length >= 1);
  t.diagnostic('ASSERTION 2 PASS: exactly one subsection card is selected and has contenteditable fields.');

  const editable = firstCard.querySelector('[contenteditable="true"]');
  const originalParent = firstCard.parentElement;
  const originalIndex = Array.from(originalParent.children).indexOf(firstCard);
  const rendersBeforeInput = subsectionModule.getRecommendationSubsectionRenderCount();
  editable.textContent = `${editable.textContent || ''} smoke-test`;
  editable.dispatchEvent(new window.Event('input', { bubbles:true }));
  await delay(30);
  assert.equal(subsectionModule.getRecommendationSubsectionRenderCount(), rendersBeforeInput);
  assert.equal(firstCard.parentElement, originalParent);
  assert.equal(Array.from(originalParent.children).indexOf(firstCard), originalIndex);
  t.diagnostic('ASSERTION 3 PASS: input does not re-render subsections or move the selected card.');

  const more = window.document.querySelector('#catalogue-direct-controls [data-direct="more"]');
  assert.ok(more, 'More fields button must exist');
  more.click();
  const modal = window.document.getElementById('catalogue-admin');
  await waitFor(() => modal && modal.hidden === false, 'More fields did not open the full editor');
  await waitFor(() => window.document.getElementById('catalogue-admin-card')?.value === firstCard.dataset.key, 'full editor did not select the direct-edited card');
  assert.equal(window.document.getElementById('catalogue-admin-card').value, firstCard.dataset.key);
  assert.ok(window.document.getElementById('catalogue-v139-brand').value.trim().length > 0);
  assert.equal(window.document.getElementById('catalogue-admin-subsection').value, firstCard.dataset.subsection);
  t.diagnostic('ASSERTION 4 PASS: More fields opens the populated full modal for the selected card.');

  const rank = window.document.getElementById('catalogue-admin-rank');
  await delay(0);
  assert.equal(Number(rank.max), sectionLengthFor(state, firstCard.dataset.subsection));
  const alternateSection = state.sections.recommendationSubsections.find(section => section.id !== firstCard.dataset.subsection && section.entryKeys.length);
  assert.ok(alternateSection, 'another subsection must contain a card');
  const alternateKey = alternateSection.entryKeys[0];
  const cardSelect = window.document.getElementById('catalogue-admin-card');
  cardSelect.value = alternateKey;
  cardSelect.dispatchEvent(new window.Event('change', { bubbles:true }));
  await delay(30);
  assert.equal(Number(rank.max), alternateSection.entryKeys.length);
  t.diagnostic('ASSERTION 5 PASS: rank max equals the selected subsection length after the deferred modal-open sync and after changing cards.');

  putBodies.length = 0;
  window.document.getElementById('catalogue-admin-save').click();
  await waitFor(() => putBodies.length > 0, 'full editor did not PUT catalogue state');
  await delay(20);
  assert.equal(putBodies.length, 1);
  const saved = putBodies[0];
  assert.equal(saved.sections?.recommendationSubsections?.length, 3);
  for (const section of saved.sections.recommendationSubsections) {
    section.entryKeys.forEach((key, index) => {
      assert.equal(saved.cards?.[key]?.rank, index + 1, `${section.id} rank for ${key}`);
      assert.equal(saved.cards?.[key]?.subsection, section.id, `${section.id} membership for ${key}`);
    });
  }
  t.diagnostic('ASSERTION 6 PASS: save emits exactly one PUT with three subsections and contiguous 1..N ranks.');

  await delay(75);
  let idleMutations = 0;
  const ownerCounts = new Map();
  const cardsRoot = window.document.getElementById('cards');
  const idleObserver = new window.MutationObserver(records => {
    idleMutations += records.length;
    for (const record of records) {
      const owner = mutationOwner(record);
      ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);
    }
  });
  idleObserver.observe(cardsRoot, { subtree:true, childList:true, attributes:true, characterData:true });
  const rendersBeforeIdle = subsectionModule.getRecommendationSubsectionRenderCount();
  await delay(300);
  const idleRenders = subsectionModule.getRecommendationSubsectionRenderCount() - rendersBeforeIdle;
  idleObserver.disconnect();
  assert.ok(idleRenders <= 2, `renderSubsectionBlocks ran ${idleRenders} times during the 300 ms idle window`);
  t.diagnostic(`ASSERTION 7 PASS: renderSubsectionBlocks ran ${idleRenders} time(s) during the 300 ms idle window.`);
  t.diagnostic(`IDLE_MUTATIONS=${idleMutations}`);
  t.diagnostic(`IDLE_MUTATION_OWNERS=${JSON.stringify(Object.fromEntries([...ownerCounts.entries()].sort((a,b) => b[1] - a[1])))}`);
});
