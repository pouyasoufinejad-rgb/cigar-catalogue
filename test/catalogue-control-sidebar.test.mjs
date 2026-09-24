import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as sidebarModule from '../public/catalogue-control-sidebar.mjs';

const {
  moveControlsToSidebar,
  restoreControlsFromSidebar
} = sidebarModule;

const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const sidebarSource = await readFile(new URL('../public/catalogue-control-sidebar.mjs', import.meta.url), 'utf8');

function catalogueFixture(url = 'https://example.test/catalogue') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <main id="host">
      <div id="catalogue-convenience-toolbar"><button data-convenience-view>Compact cards</button></div>
      <div class="controls">
        <div class="sort-pair"><select id="sort"><option>Recommended order</option></select></div>
        <div class="toggle"><button data-filter="instock">In stock</button></div>
      </div>
      <div id="cards">
        <section class="tier-block" data-recommendation-subsection="coronets-cigarillos">
          <div class="grid" id="recommendation-coronets-cigarillos">
            <article class="card" data-key="liga-privada-no-9-coronets"><h3><small>Liga Privada</small>No. 9 Coronets</h3></article>
            <article class="card hidden" data-key="undercrown-maduro-coronets"><h3><small>Undercrown</small>Maduro Coronets</h3></article>
            <article class="card" data-key="example-brand-cigar"><h3><span>Example Brand</span>Example Cigar</h3></article>
          </div>
        </section>
        <section class="tier-block" data-recommendation-subsection="petit-panatelas">
          <div class="grid" id="recommendation-petit-panatelas">
            <article class="card" data-key="davidoff-escurio-petit-robusto"><h3><small>Davidoff</small>Escurio Petit Robusto</h3></article>
          </div>
        </section>
        <section class="tier-block" data-recommendation-subsection="flavoured-infused">
          <div class="grid" id="recommendation-flavoured-infused">
            <article class="card" data-key="cao-bella-vanilla"><h3><span>CAO</span>Bella Vanilla Cigarillos</h3></article>
            <article class="card" data-key="tabak-especial-cafecita-negra"><h3><span>Drew Estate</span>Tabak Especial Cafecita Negra</h3></article>
          </div>
        </section>
      </div>
    </main>
  </body></html>`, { url });
  return dom;
}

test('runtime loads the cache-busted control-sidebar placement module', () => {
  assert.match(runtimeSource, /catalogue-control-sidebar\.mjs\?v=sidebar-controls-7/);
});

test('the sidebar sits left of its old anchor without its left edge leaving the window', () => {
  assert.match(sidebarSource, /const DESKTOP_QUERY = '\(min-width: 1660px\)'/);
  const shift = Number(sidebarSource.match(/const RAIL_SHIFT = (\d+);/)?.[1]);
  assert.ok(shift > 0, 'the rail should be shifted left by a real amount');
  assert.match(sidebarSource, /right:calc\(50vw \+ 650px \+ var\(--rail-shift\)\)/);
  // The width has to subtract the same shift. Without that the rail keeps its width and
  // its left edge walks off the left of the window on a viewport with no room to give.
  assert.match(sidebarSource, /width:min\(250px,calc\(50vw - 660px - var\(--rail-shift\)\)\)/);

  // Solve the two cases by hand: while the width is capped at 250px the rail really moves
  // left, and once the window is too narrow for that the left edge is pinned instead.
  const left = vw => {
    const rightOffset = vw / 2 + 650 + shift;
    const width = Math.min(250, vw / 2 - 660 - shift);
    return { left: vw - rightOffset - width, width };
  };
  const wide = left(2560);
  assert.equal(wide.width, 250, 'a wide window keeps the full rail');
  assert.equal(wide.left, 1280 - 900 - shift, `and moves it left by ${shift}px`);
  const tight = left(1800);
  assert.equal(tight.left, 10, 'a tight window pins the left edge rather than clipping it');
  assert.ok(tight.width > 0);
});

test('sidebar placement reparents the existing controls without cloning or replacing them', () => {
  const dom = catalogueFixture();
  const { document } = dom.window;
  const toolbar = document.getElementById('catalogue-convenience-toolbar');
  const controls = document.querySelector('.controls');
  const sort = document.getElementById('sort');
  const filter = document.querySelector('[data-filter="instock"]');

  const sidebar = moveControlsToSidebar(document, dom.window);

  assert.equal(sidebar.id, 'catalogue-control-sidebar');
  assert.equal(sidebar.querySelectorAll('#catalogue-sidebar-extra-controls').length, 1);
  assert.equal(sidebar.querySelectorAll('#catalogue-convenience-toolbar').length, 1);
  assert.equal(sidebar.querySelectorAll('.controls').length, 1);
  assert.equal(document.getElementById('sort'), sort);
  assert.equal(document.querySelector('[data-filter="instock"]'), filter);

  restoreControlsFromSidebar(document);
  const host = document.getElementById('host');
  const extras = document.getElementById('catalogue-sidebar-extra-controls');
  assert.equal(extras.parentElement, host);
  assert.equal(toolbar.parentElement, host);
  assert.equal(controls.parentElement, host);
  assert.ok(extras.compareDocumentPosition(toolbar) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(toolbar.compareDocumentPosition(controls) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(controls.compareDocumentPosition(document.getElementById('cards')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(document.getElementById('catalogue-control-sidebar'), null);

  dom.window.close();
});

test('catalogue navigation uses stable subsection ids and smooth scrolling without changing filters', () => {
  const dom = catalogueFixture();
  const { document } = dom.window;
  const target = document.getElementById('recommendation-petit-panatelas').closest('[data-recommendation-subsection]');
  let scrollOptions = null;
  target.scrollIntoView = options => { scrollOptions = options; };

  moveControlsToSidebar(document, dom.window);
  const button = document.querySelector('[data-catalogue-jump="petit-panatelas"]');
  assert.equal(button.textContent.trim(), 'Petit Panatelas, Petit Coronas & Petit Robustos');
  button.click();

  assert.deepEqual(scrollOptions, { behavior:'smooth', block:'start' });
  assert.ok(document.querySelector('[data-filter="instock"]'));
  dom.window.close();
});

test('brand and line filter is single-select, composes with existing hidden state, and persists in the URL', () => {
  const dom = catalogueFixture('https://example.test/catalogue?foo=bar');
  const { document } = dom.window;
  moveControlsToSidebar(document, dom.window);

  const liga = document.querySelector('[data-brand-line-filter="liga-privada"]');
  const all = document.querySelector('[data-brand-line-filter="all"]');
  const ligaCard = document.querySelector('[data-key="liga-privada-no-9-coronets"]');
  const undercrownCard = document.querySelector('[data-key="undercrown-maduro-coronets"]');
  const davidoffCard = document.querySelector('[data-key="davidoff-escurio-petit-robusto"]');

  assert.ok(liga, 'Liga Privada filter should exist');
  assert.ok(document.querySelector('[data-brand-line-filter="undercrown"]'), 'Undercrown filter should exist');
  assert.ok(document.querySelector('[data-brand-line-filter="davidoff"]'), 'Davidoff filter should exist');
  assert.ok(document.querySelector('[data-brand-line-filter="cao"]'), 'CAO filter should exist');
  assert.ok(document.querySelector('[data-brand-line-filter="drew-estate"]'), 'Drew Estate filter should exist');
  assert.ok(document.querySelector('[data-brand-line-filter="example-brand"]'), 'brands rendered with h3 span should be discovered');

  liga.click();
  assert.equal(liga.getAttribute('aria-pressed'), 'true');
  assert.equal(all.getAttribute('aria-pressed'), 'false');
  assert.equal(ligaCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(undercrownCard.classList.contains('brand-line-filter-hidden'), true);
  assert.equal(davidoffCard.classList.contains('brand-line-filter-hidden'), true);
  assert.equal(undercrownCard.classList.contains('hidden'), true, 'existing stock/price hidden state must be preserved');
  assert.equal(new URL(dom.window.location.href).searchParams.get('brandLine'), 'liga-privada');
  assert.equal(new URL(dom.window.location.href).searchParams.get('foo'), 'bar');
  assert.match(document.querySelector('[data-recommendation-subsection="petit-panatelas"] .catalogue-brand-line-empty').textContent, /No Liga Privada matches/);

  all.click();
  assert.equal(ligaCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(undercrownCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(davidoffCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(undercrownCard.classList.contains('hidden'), true, 'clearing brand filter must not clear another filter');
  assert.equal(new URL(dom.window.location.href).searchParams.has('brandLine'), false);
  assert.equal(document.querySelector('.catalogue-brand-line-empty'), null);
  dom.window.close();
});

test('brand filter restores from URL', () => {
  const dom = catalogueFixture('https://example.test/catalogue?brandLine=davidoff');
  const { document } = dom.window;
  moveControlsToSidebar(document, dom.window);

  const davidoff = document.querySelector('[data-brand-line-filter="davidoff"]');
  const ligaCard = document.querySelector('[data-key="liga-privada-no-9-coronets"]');
  const davidoffCard = document.querySelector('[data-key="davidoff-escurio-petit-robusto"]');
  assert.equal(davidoff.getAttribute('aria-pressed'), 'true');
  assert.equal(ligaCard.classList.contains('brand-line-filter-hidden'), true);
  assert.equal(davidoffCard.classList.contains('brand-line-filter-hidden'), false);
  dom.window.close();
});

test('brand-line buttons support optional small logos without requiring them', () => {
  assert.equal(typeof sidebarModule.createBrandLineButton, 'function');
  const dom = new JSDOM('<!doctype html><body></body>');
  const { document } = dom.window;

  const textOnly = sidebarModule.createBrandLineButton(document, { id:'plain', label:'Plain Brand', logo:'' });
  assert.equal(textOnly.textContent.trim(), 'Plain Brand');
  assert.equal(textOnly.querySelector('img'), null);

  const withLogo = sidebarModule.createBrandLineButton(document, { id:'logo', label:'Logo Brand', logo:'/brand-logos/logo.webp' });
  const image = withLogo.querySelector('.catalogue-brand-line-logo');
  assert.ok(image);
  assert.match(image.src, /\/brand-logos\/logo\.webp$/);
  assert.equal(withLogo.textContent.trim(), 'Logo Brand');
  dom.window.close();
});


test('CAO and Drew Estate sidebar filters match span-rendered catalogue cards', () => {
  const dom = catalogueFixture();
  const { document } = dom.window;
  moveControlsToSidebar(document, dom.window);

  const cao = document.querySelector('[data-brand-line-filter="cao"]');
  const drew = document.querySelector('[data-brand-line-filter="drew-estate"]');
  const caoCard = document.querySelector('[data-key="cao-bella-vanilla"]');
  const drewCard = document.querySelector('[data-key="tabak-especial-cafecita-negra"]');
  const davidoffCard = document.querySelector('[data-key="davidoff-escurio-petit-robusto"]');

  cao.click();
  assert.equal(caoCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(drewCard.classList.contains('brand-line-filter-hidden'), true);

  drew.click();
  assert.equal(drewCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(caoCard.classList.contains('brand-line-filter-hidden'), true);
  assert.equal(davidoffCard.classList.contains('brand-line-filter-hidden'), true);

  dom.window.close();
});
