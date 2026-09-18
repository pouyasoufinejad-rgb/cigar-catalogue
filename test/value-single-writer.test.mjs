import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { deriveValue } from '../public/catalogue-value.mjs';

const sizeRuntimeSource = await readFile(new URL('../public/catalogue-size-value-runtime.mjs', import.meta.url), 'utf8');
const bootstrapSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

// Every importer of the flavour module must use a byte-identical specifier. A module
// URL with a different query string is a separate instance with separate state, so a
// mismatch would put the size runtime's Value registration on one copy while the page
// used another, silently restoring the flipping medal.
function flavourSpecifier(source) {
  return source.match(/['"](\.\/catalogue-flavour\.mjs[^'"]*)['"]/)?.[1] || null;
}

test('every runtime importer of the flavour module resolves to one instance', () => {
  const fromSizeRuntime = flavourSpecifier(sizeRuntimeSource);
  const fromBootstrap = flavourSpecifier(bootstrapSource);
  assert.ok(fromSizeRuntime, 'size runtime should import the flavour module');
  assert.ok(fromBootstrap, 'bootstrap should import the flavour module');
  assert.equal(
    fromSizeRuntime,
    fromBootstrap,
    'mismatched specifiers would load two copies of the flavour module and break the single-writer registration'
  );
});

function medal(label, score) {
  const tier = score >= 7 ? 'gold' : score >= 5 ? 'silver' : 'bronze';
  return `<div class="rating ${tier}"><span>${label}</span><i class="medal ${tier}"></i><b>${tier[0].toUpperCase() + tier.slice(1)}</b><small class="subscore">${score}/10</small></div>`;
}

// A long, narrow stick: its size factor is well away from 1, so a score that ignores
// dimensions lands on a different tier from one that accounts for them.
function fixture({ price = 26, quality = 7, length = 7, ring = 38 } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="cards">
      <article class="card" data-key="lancero" data-price="${price}">
        <div class="artframe" data-visual-length="${length}" data-visual-ring="${ring}"></div>
        <div class="medals">${medal('Quality', quality)}${medal('Value', 1)}</div>
      </article>
    </div>
  </body></html>`, { url: 'https://example.test/' });
  return dom;
}

function valueTier(dom) {
  const node = [...dom.window.document.querySelectorAll('.rating')]
    .find(row => row.querySelector(':scope > span')?.textContent.trim() === 'Value');
  return ['gold', 'silver', 'bronze'].find(tier => node.classList.contains(tier)) || null;
}

async function loadModules(dom) {
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CSS = dom.window.CSS;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  // Import the flavour module through the exact specifier the size runtime uses, so the
  // test exercises the same single instance the browser gets. Hardcoding a bare path
  // here would give the test its own copy and the registration would look broken.
  const specifier = flavourSpecifier(sizeRuntimeSource).replace('./', '../public/');
  const flavour = await import(specifier);
  const sizeRuntime = await import('../public/catalogue-size-value-runtime.mjs');
  return { flavour, sizeRuntime };
}

test('the two Value code paths agree on a card whose size factor is not 1', async () => {
  const dom = fixture();
  const { flavour, sizeRuntime } = await loadModules(dom);
  const card = dom.window.document.querySelector('article.card');

  sizeRuntime.refreshSizeAdjustedValueForCard(card, {});
  const afterSizeAdjusted = valueTier(dom);

  // This is what used to race with it on its own timer.
  flavour.refreshValueForCard(card, null);
  const afterFlavour = valueTier(dom);

  assert.ok(afterSizeAdjusted, 'the size-adjusted path should set a tier');
  assert.equal(
    afterFlavour,
    afterSizeAdjusted,
    'both refresh paths must land on the same tier, otherwise the medal flips depending on which timer ran last'
  );
});

test('the flavour path reproduces the size-adjusted score exactly', async () => {
  const dom = fixture({ price: 26, quality: 7, length: 7, ring: 38 });
  const { flavour, sizeRuntime } = await loadModules(dom);
  const card = dom.window.document.querySelector('article.card');

  const expected = sizeRuntime.refreshSizeAdjustedValueForCard(card, {});
  const viaFlavour = flavour.refreshValueForCard(card, null);
  assert.equal(viaFlavour.score, expected.score);
  assert.equal(
    card.dataset.value,
    String(expected.score >= 7 ? 3 : expected.score >= 5 ? 2 : 1),
    'the sort key must match the displayed medal'
  );
});

test('the size factor genuinely moves this fixture across a tier boundary', () => {
  // Guards the test itself: if these ever converge the assertions above stop proving
  // anything, because any single writer would pass.
  const withSize = deriveValue(26, 7, null, { length: 7, ring: 38, catalogueType: '', valueUnit: '' });
  const withoutSize = deriveValue(26, 7, null);
  assert.notEqual(
    withSize.score >= 7 ? 'gold' : withSize.score >= 5 ? 'silver' : 'bronze',
    withoutSize.score >= 7 ? 'gold' : withoutSize.score >= 5 ? 'silver' : 'bronze',
    'fixture must straddle a tier boundary for the regression test to be meaningful'
  );
});
