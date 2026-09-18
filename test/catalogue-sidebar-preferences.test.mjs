import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  installControlSidebar,
  SIDEBAR_PREFS_KEY,
  readSidebarPreferences,
  hideBrandLine,
  restoreHiddenBrandLines,
  renameCatalogueJump,
  catalogueJumpLabel
} from '../public/catalogue-control-sidebar.mjs';

function fixture() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <main id="host">
      <div id="catalogue-convenience-toolbar"></div>
      <div class="controls"></div>
      <div id="cards">
        <section class="tier-block" data-recommendation-subsection="coronets-cigarillos">
          <div class="grid" id="recommendation-coronets-cigarillos">
            <article class="card" data-key="cao-bella-vanilla"><h3><span>CAO</span>Bella Vanilla</h3>
              <div class="value-calc"><span>Q7 benchmark <b>A$14</b></span></div>
            </article>
            <article class="card" data-key="davidoff-escurio"><h3><span>Davidoff</span>Escurio</h3></article>
          </div>
        </section>
      </div>
    </main>
  </body></html>`, { url: 'https://example.test/catalogue' });
  return dom;
}

test('the brands and lines section is collapsed by default', () => {
  const dom = fixture();
  installControlSidebar(dom.window.document, dom.window);
  const toggle = dom.window.document.querySelector('[data-brand-line-toggle]');
  const list = dom.window.document.querySelector('[data-brand-line-options]');
  assert.ok(toggle, 'the heading should be a toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(list.hidden, true, 'the brand list starts collapsed');
  assert.match(toggle.textContent, /BRANDS & LINES/);
});

test('expanding the brands section reveals the list and is remembered', () => {
  const dom = fixture();
  installControlSidebar(dom.window.document, dom.window);
  const toggle = dom.window.document.querySelector('[data-brand-line-toggle]');
  toggle.dispatchEvent(new dom.window.Event('click'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(dom.window.document.querySelector('[data-brand-line-options]').hidden, false);
  assert.equal(readSidebarPreferences(dom.window).brandsExpanded, true);
});

test('removing a brand drops it from the list and leaves every catalogue card untouched', () => {
  const dom = fixture();
  const { document } = dom.window;
  installControlSidebar(document, dom.window);

  const before = [...document.querySelectorAll('article.card')].map(card => card.outerHTML);
  assert.ok(document.querySelector('[data-brand-line-filter="cao"]'), 'CAO chip should exist first');

  document.querySelector('[data-brand-line-remove="cao"]').dispatchEvent(new dom.window.Event('click'));

  assert.equal(document.querySelector('[data-brand-line-filter="cao"]'), null, 'CAO chip is gone');
  assert.ok(document.querySelector('[data-brand-line-filter="davidoff"]'), 'other chips survive');
  assert.deepEqual(readSidebarPreferences(dom.window).hiddenBrandLines, ['cao']);

  const after = [...document.querySelectorAll('article.card')].map(card => card.outerHTML);
  assert.deepEqual(after, before, 'hiding a brand chip must not alter any catalogue card');
});

test('a removed brand can be restored', () => {
  const dom = fixture();
  const { document } = dom.window;
  installControlSidebar(document, dom.window);
  document.querySelector('[data-brand-line-remove="cao"]').dispatchEvent(new dom.window.Event('click'));

  const restore = document.querySelector('[data-brand-line-restore]');
  assert.ok(restore, 'a restore control appears once something is hidden');
  assert.match(restore.textContent, /Restore hidden \(1\)/);
  restore.dispatchEvent(new dom.window.Event('click'));

  assert.ok(document.querySelector('[data-brand-line-filter="cao"]'), 'CAO chip is back');
  assert.deepEqual(readSidebarPreferences(dom.window).hiddenBrandLines, []);
});

test('catalogue jump buttons can be renamed and the name persists', () => {
  const dom = fixture();
  const { document } = dom.window;
  dom.window.prompt = () => 'Small Smokes';
  installControlSidebar(document, dom.window);

  const button = document.querySelector('[data-catalogue-jump="coronets-cigarillos"]');
  assert.equal(button.textContent, 'Coronets & Cigarillos');

  document.querySelector('[data-catalogue-jump-rename="coronets-cigarillos"]').dispatchEvent(new dom.window.Event('click'));
  assert.equal(button.textContent, 'Small Smokes');
  assert.equal(readSidebarPreferences(dom.window).jumpLabels['coronets-cigarillos'], 'Small Smokes');
});

test('cancelling a rename leaves the button name alone', () => {
  const dom = fixture();
  const { document } = dom.window;
  dom.window.prompt = () => null;
  installControlSidebar(document, dom.window);

  document.querySelector('[data-catalogue-jump-rename="petit-panatelas"]').dispatchEvent(new dom.window.Event('click'));
  assert.equal(
    document.querySelector('[data-catalogue-jump="petit-panatelas"]').textContent,
    'Petit Panatelas, Petit Coronas & Petit Robustos'
  );
  assert.equal(readSidebarPreferences(dom.window).jumpLabels['petit-panatelas'], undefined);
});

test('clearing a custom name falls back to the built-in label', () => {
  const dom = fixture();
  renameCatalogueJump('flavoured-infused', 'Sweets', dom.window);
  assert.equal(catalogueJumpLabel({ id:'flavoured-infused', label:'Flavoured & Infused Cigars' }, dom.window), 'Sweets');
  renameCatalogueJump('flavoured-infused', '   ', dom.window);
  assert.equal(catalogueJumpLabel({ id:'flavoured-infused', label:'Flavoured & Infused Cigars' }, dom.window), 'Flavoured & Infused Cigars');
});

test('preferences live in browser storage only, never in catalogue state', () => {
  const dom = fixture();
  hideBrandLine('cao', dom.window);
  renameCatalogueJump('coronets-cigarillos', 'Small', dom.window);
  const stored = JSON.parse(dom.window.localStorage.getItem(SIDEBAR_PREFS_KEY));
  assert.deepEqual(stored.hiddenBrandLines, ['cao']);
  assert.equal(stored.jumpLabels['coronets-cigarillos'], 'Small');
  restoreHiddenBrandLines(dom.window);
  assert.deepEqual(readSidebarPreferences(dom.window).hiddenBrandLines, []);
});

test('unreadable browser storage degrades to defaults instead of throwing', () => {
  const view = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
  assert.deepEqual(readSidebarPreferences(view), { hiddenBrandLines: [], jumpLabels: {}, brandsExpanded: false });
  assert.doesNotThrow(() => hideBrandLine('cao', view));
});

test('the per-card value benchmark strip is hidden by the sidebar stylesheet', () => {
  const dom = fixture();
  installControlSidebar(dom.window.document, dom.window);
  const style = dom.window.document.getElementById('catalogue-control-sidebar-style-v2');
  assert.match(style.textContent, /\.value-calc\{display:none!important\}/);
});
