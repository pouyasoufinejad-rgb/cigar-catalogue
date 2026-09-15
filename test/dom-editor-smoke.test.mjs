import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const INDEX_URL = new URL('../public/index.html', import.meta.url);
const RUNTIME_URL = new URL('../public/catalogue-runtime.mjs', import.meta.url);
const ADMIN_URL = new URL('../public/catalogue-admin-unified-v139.mjs?v=145', import.meta.url);
const STOCK_URL = new URL('../public/catalogue-stock-client.mjs?v=145', import.meta.url);
const STATE_API = '/api/catalogue-overrides';
const STOCK_API = '/api/stock';
const ADMIN_TOKEN_SESSION_KEY = 'cigar-catalogue-admin-token';

const DEFAULT_SUBSECTIONS = [
  { id:'coronets-cigarillos', title:'Coronets & Cigarillos', note:'Ring gauge 34 and under.', entryKeys:[] },
  { id:'petit-panatelas', title:'Petit Panatelas', note:'Ring gauge 35 and over.', entryKeys:[] },
  { id:'flavoured-infused', title:'Flavoured & Infused Cigars', note:'Sweetened, aromatic and infused profiles.', entryKeys:[] }
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function cssEscape(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, char => `\\${char}`);
}

function cardType(card) {
  const explicit = String(card?.dataset?.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || card?.dataset?.taster === '1') return 'taster';
  return /half|halv/i.test(String(card?.textContent || '')) ? 'half' : 'main';
}

function productionLines(card) {
  const node = card.querySelector('.artmeta-left');
  if (!node) return [];
  const explicit = Array.from(node.querySelectorAll('.artmeta-line'));
  if (explicit.length) return explicit.map(item => String(item.textContent || '').trim());
  return Array.from(node.children)
    .filter(child => !child.classList.contains('artmeta-title'))
    .map(child => String(child.textContent || '').trim());
}

function ringGauge(card) {
  const visual = Number(card.querySelector('.artframe')?.dataset?.visualRing);
  if (Number.isFinite(visual) && visual >= 10 && visual <= 99) return Math.round(visual);
  const facts = Array.from(card.querySelectorAll('.facts > div'));
  const size = facts.find(node => /[×x]/i.test(String(node.querySelector('b')?.textContent || node.textContent || '')));
  const match = String(size?.querySelector('b')?.textContent || size?.textContent || '').match(/[×x]\s*(\d{2})(?!\d)/i);
  return match ? Number(match[1]) : null;
}

function subsectionForCard(card) {
  if (productionLines(card).some(line => line.toLowerCase() === 'flavoured')) return 'flavoured-infused';
  const ring = ringGauge(card);
  return ring !== null && ring >= 35 ? 'petit-panatelas' : 'coronets-cigarillos';
}

function buildStateFromDom(document) {
  const sections = DEFAULT_SUBSECTIONS.map(section => ({ ...section, entryKeys:[] }));
  const byId = new Map(sections.map(section => [section.id, section]));
  const cards = {};
  const all = Array.from(document.querySelectorAll('article.card[data-key]'));
  const ordered = [...all].sort((a, b) => (Number(a.dataset.rank) || 9999) - (Number(b.dataset.rank) || 9999));

  for (const card of ordered) {
    const key = String(card.dataset.key || '').trim();
    if (!key) continue;
    const archived = card.dataset.archived === '1';
    const type = cardType(card);
    if (archived) {
      cards[key] = { ...(cards[key] || {}), archived:true, catalogueType:type, taster:type === 'taster' };
      continue;
    }
    if (type !== 'main') {
      cards[key] = {
        ...(cards[key] || {}),
        catalogueType:type,
        taster:type === 'taster',
        rank:Math.max(1, Number(card.dataset.rank) || 1)
      };
      continue;
    }
    const subsection = subsectionForCard(card);
    const destination = byId.get(subsection) || sections[0];
    destination.entryKeys.push(key);
  }

  for (const section of sections) {
    section.entryKeys.forEach((key, index) => {
      cards[key] = { ...(cards[key] || {}), catalogueType:'main', taster:false, rank:index + 1, subsection:section.id };
    });
  }

  return { version:3, cards, sections:{ recommendationSubsections:sections }, entries:{} };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers:{ 'content-type':'application/json' }
  });
}

function snapshotGlobals(names) {
  const descriptors = new Map();
  for (const name of names) descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  return () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

function installDomGlobals(window) {
  const names = [
    'window', 'document', 'MutationObserver', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
    'MouseEvent', 'KeyboardEvent', 'DOMParser', 'CSS', 'sessionStorage', 'localStorage', 'location',
    'navigator', 'getComputedStyle', 'alert', 'prompt', 'confirm'
  ];
  const restore = snapshotGlobals(names);
  const values = {
    window,
    document:window.document,
    MutationObserver:window.MutationObserver,
    HTMLElement:window.HTMLElement,
    Element:window.Element,
    Node:window.Node,
    Event:window.Event,
    CustomEvent:window.CustomEvent,
    MouseEvent:window.MouseEvent,
    KeyboardEvent:window.KeyboardEvent,
    DOMParser:window.DOMParser,
    CSS:window.CSS,
    sessionStorage:window.sessionStorage,
    localStorage:window.localStorage,
    location:window.location,
    navigator:window.navigator,
    getComputedStyle:window.getComputedStyle.bind(window),
    alert:() => {},
    prompt:() => 'test-admin-token',
    confirm:() => true
  };
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, name, { configurable:true, writable:true, value });
  }
  return restore;
}

function mutationBucket(record) {
  const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
  const key = target?.closest?.('article.card[data-key]')?.dataset?.key || 'non-card';
  const cls = String(target?.className || target?.nodeName || 'unknown').replace(/\s+/g, '.').slice(0, 90);
  return `${record.type}${record.attributeName ? `:${record.attributeName}` : ''}:${cls}:${key}`;
}

async function waitFor(predicate, timeoutMs = 1500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for browser state.');
    await delay(10);
  }
}

const html = await readFile(INDEX_URL, 'utf8');
const runtimeSource = await readFile(RUNTIME_URL, 'utf8');

test('catalogue editor survives subsection restructuring in a real DOM', async t => {
  let dom = null;
  let serverState = { version:3, cards:{}, sections:{ recommendationSubsections:DEFAULT_SUBSECTIONS }, entries:{} };
  const statePuts = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/Could not parse CSS stylesheet|Not implemented: navigation/i.test(String(error?.message || error))) {
      console.error('[dom-editor-smoke jsdom]', error?.message || error);
    }
  });

  const fetchStub = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input?.url || String(input || '');
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    const url = new URL(raw, 'https://catalogue.test/');
    if (url.pathname === STATE_API) {
      if (method === 'PUT') {
        const body = JSON.parse(String(init?.body || '{}'));
        statePuts.push(body);
        serverState = {
          version:3,
          cards:body.cards && typeof body.cards === 'object' ? body.cards : {},
          sections:body.sections && typeof body.sections === 'object' ? body.sections : {},
          entries:serverState.entries || {}
        };
      }
      return jsonResponse(serverState);
    }
    if (url.pathname === STOCK_API) {
      return jsonResponse({ results:{}, meta:{ lastRestockAt:0, lastFullAt:0 } });
    }
    if (url.pathname === '/api/stock/check') {
      return jsonResponse({ ok:true, results:{}, meta:{ lastRestockAt:Date.now(), lastFullAt:0 } });
    }
    if (url.pathname.startsWith('/api/catalogue-entry/')) return jsonResponse({ error:'unexpected entry request' }, 500);
    if (url.pathname.startsWith('/api/catalogue-image/')) return jsonResponse({ error:'unexpected image request' }, 500);
    return new Response('', { status:404 });
  };

  dom = new JSDOM(html, {
    url:'https://catalogue.test/',
    runScripts:'dangerously',
    pretendToBeVisual:true,
    virtualConsole,
    beforeParse(window) {
      if (!window.CSS) window.CSS = {};
      window.CSS.escape = cssEscape;
      window.fetch = fetchStub;
      window.alert = () => {};
      window.prompt = () => 'test-admin-token';
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.matchMedia = window.matchMedia || (() => ({ matches:false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
      window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
    }
  });

  const { window } = dom;
  const { document } = window;
  serverState = buildStateFromDom(document);
  assert.equal(serverState.sections.recommendationSubsections.length, 3, 'smoke fixture should expose all three recommendation subsections');
  assert.ok(serverState.sections.recommendationSubsections.every(section => section.entryKeys.length > 0), 'each recommendation subsection needs a real card for this smoke test');

  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once:true }));
  }

  const restoreGlobals = installDomGlobals(window);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreGlobals();
    dom?.window?.close();
  });

  await import(ADMIN_URL.href);
  await import(STOCK_URL.href);

  const runtimeSpecs = Array.from(runtimeSource.matchAll(/import\((['"])(.+?)\1\)/g), match => match[2]);
  assert.ok(runtimeSpecs.length > 0, 'runtime module list should be discoverable');
  const runtimeUrls = runtimeSpecs.map(spec => new URL(spec, RUNTIME_URL));
  const runtimeModules = await Promise.all(runtimeUrls.map(url => import(url.href)));
  const subsectionIndex = runtimeSpecs.findIndex(spec => spec.includes('catalogue-recommendation-subsections.mjs'));
  assert.ok(subsectionIndex >= 0, 'recommendation subsection module must be in runtime list');
  const subsectionModule = runtimeModules[subsectionIndex];

  await window.catalogueOverridesReady;
  await delay(250);

  const cardsRoot = document.getElementById('cards');
  assert.ok(cardsRoot, '#cards must exist');
  let idleMutationCount = 0;
  const idleBreakdown = new Map();
  const idleObserver = new window.MutationObserver(records => {
    idleMutationCount += records.length;
    for (const record of records) {
      const bucket = mutationBucket(record);
      idleBreakdown.set(bucket, (idleBreakdown.get(bucket) || 0) + 1);
    }
  });
  const idleRenderStart = subsectionModule.recommendationSubsectionRenderCount;
  idleObserver.observe(cardsRoot, { subtree:true, childList:true, attributes:true, characterData:true });
  await delay(300);
  idleObserver.disconnect();
  const idleRenderDelta = subsectionModule.recommendationSubsectionRenderCount - idleRenderStart;

  let selectedCard = null;
  let initialSubsectionId = '';

  await t.test('1. Edit catalogue enters direct editing mode', async () => {
    const toggle = document.getElementById('catalogue-admin-toggle');
    assert.ok(toggle, 'Edit catalogue toggle must exist');
    toggle.click();
    await delay(0);
    assert.ok(document.body.classList.contains('catalogue-direct-edit-mode'));
    assert.equal(toggle.textContent.trim(), 'Finish editing');
  });

  await t.test('2. subsection card selection enables in-place fields', async () => {
    selectedCard = Array.from(document.querySelectorAll('#cards [data-recommendation-subsection] article.card[data-key]'))
      .find(card => card.dataset.archived !== '1' && cardType(card) === 'main');
    assert.ok(selectedCard, 'a main recommendation card should be available in a subsection grid');
    selectedCard.dispatchEvent(new window.MouseEvent('click', { bubbles:true, cancelable:true }));
    await delay(40);
    const selected = document.querySelectorAll('article.card.catalogue-direct-selected');
    assert.equal(selected.length, 1);
    assert.equal(selected[0], selectedCard);
    assert.ok(selectedCard.querySelectorAll('[contenteditable="true"]').length > 0);
    initialSubsectionId = selectedCard.dataset.subsection;
    assert.ok(initialSubsectionId, 'selected card should carry subsection membership');
  });

  await t.test('3. typing does not rerender or move the selected card', async () => {
    await delay(60);
    const editable = selectedCard.querySelector('.summary[contenteditable="true"]') || selectedCard.querySelector('[contenteditable="true"]');
    assert.ok(editable, 'selected card should expose an editable field');
    const parentBefore = selectedCard.parentElement;
    const indexBefore = Array.from(parentBefore.children).indexOf(selectedCard);
    const renderBefore = subsectionModule.recommendationSubsectionRenderCount;
    editable.textContent = `${editable.textContent} smoke-test`;
    editable.dispatchEvent(new window.Event('input', { bubbles:true }));
    await delay(80);
    assert.equal(subsectionModule.recommendationSubsectionRenderCount, renderBefore, 'input must not run renderSubsectionBlocks');
    assert.equal(selectedCard.parentElement, parentBefore, 'input must not move the selected card to another parent');
    assert.equal(Array.from(parentBefore.children).indexOf(selectedCard), indexBefore, 'input must preserve sibling position');
  });

  await t.test('4. More fields opens the full modal with selected card data', async () => {
    const more = document.querySelector('#catalogue-direct-controls [data-direct="more"]');
    assert.ok(more, 'direct edit More fields button must exist');
    more.click();
    await delay(80);
    const modal = document.getElementById('catalogue-admin');
    assert.ok(modal && !modal.hidden, 'full modal should be open');
    assert.equal(document.getElementById('catalogue-admin-card')?.value, selectedCard.dataset.key);
    assert.equal(document.getElementById('catalogue-v139-key')?.value, selectedCard.dataset.key);
    assert.ok(String(document.getElementById('catalogue-v139-brand')?.value || '').trim().length > 0, 'brand should be populated');
    assert.equal(document.getElementById('catalogue-admin-subsection')?.value, initialSubsectionId);
  });

  await t.test('5. rank max follows subsection length on open and selection change', async () => {
    const sections = serverState.sections.recommendationSubsections;
    const rank = document.getElementById('catalogue-admin-rank');
    const subsection = document.getElementById('catalogue-admin-subsection');
    const cardSelect = document.getElementById('catalogue-admin-card');
    const firstSection = sections.find(section => section.id === subsection.value);
    assert.ok(firstSection, 'selected subsection should exist in state');
    assert.equal(rank.max, String(firstSection.entryKeys.length), 'rank max should match subsection immediately after modal open');

    const secondSection = sections.find(section => section.id !== firstSection.id && section.entryKeys.some(key => Array.from(cardSelect.options).some(option => option.value === key)));
    assert.ok(secondSection, 'a second subsection with a selectable card is required');
    const nextKey = secondSection.entryKeys.find(key => Array.from(cardSelect.options).some(option => option.value === key));
    cardSelect.value = nextKey;
    cardSelect.dispatchEvent(new window.Event('change', { bubbles:true }));
    await delay(50);
    assert.equal(subsection.value, secondSection.id, 'subsection control should follow changed card selection');
    assert.equal(rank.max, String(secondSection.entryKeys.length), 'rank max should follow the newly selected subsection length');
  });

  await t.test('6. full editor save sends one subsection-preserving PUT with contiguous ranks', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, 'test-admin-token');
    statePuts.length = 0;
    const save = document.getElementById('catalogue-admin-save');
    assert.ok(save, 'full editor save button must exist');
    save.click();
    await waitFor(() => statePuts.length >= 1);
    await delay(30);
    assert.equal(statePuts.length, 1, 'one click should issue exactly one catalogue state PUT');
    const body = statePuts[0];
    const sections = body.sections?.recommendationSubsections;
    assert.ok(Array.isArray(sections), 'save body should preserve recommendationSubsections');
    assert.equal(sections.length, 3, 'all three recommendation subsections should be saved');
    assert.deepEqual(sections.map(section => section.id), DEFAULT_SUBSECTIONS.map(section => section.id));
    for (const section of sections) {
      const ranks = section.entryKeys.map(key => body.cards?.[key]?.rank);
      assert.deepEqual(ranks, section.entryKeys.map((_, index) => index + 1), `${section.id} should carry contiguous ranks`);
      section.entryKeys.forEach(key => assert.equal(body.cards?.[key]?.subsection, section.id, `${key} should retain subsection membership`));
    }
  });

  await t.test('7. settled page renders recommendation subsections at most twice in 300 ms', () => {
    assert.ok(idleRenderDelta <= 2, `renderSubsectionBlocks ran ${idleRenderDelta} times during the idle window`);
  });

  const topIdleMutations = [...idleBreakdown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`[dom-editor-smoke] idle #cards mutations over 300ms: ${idleMutationCount}`);
  console.log(`[dom-editor-smoke] idle renderSubsectionBlocks calls over 300ms: ${idleRenderDelta}`);
  console.log(`[dom-editor-smoke] idle mutation breakdown: ${JSON.stringify(topIdleMutations)}`);
});
