import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as sidebarModule from '../public/catalogue-control-sidebar.mjs';

const {
  moveControlsToSidebar,
  restoreControlsFromSidebar,
  discoverBrandLineFilters
} = sidebarModule;

const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

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
            <article class="card" data-key="liga-privada-no-9-coronets"><h3><span>Liga Privada</span>No. 9 Coronets</h3></article>
            <article class="card hidden" data-key="undercrown-maduro-coronets"><h3><span>Undercrown</span>Maduro Coronets</h3></article>
            <article class="card" data-key="oliva-serie-g"><h3><span>Oliva</span>Serie G Cigarillos</h3></article>
            <article class="card" data-key="cao-bella-vanilla"><h3><span>CAO</span>Bella Vanilla</h3></article>
            <article class="card" data-key="drew-estate-acid-krush-red-cameroon"><h3><span>Drew Estate</span>ACID Krush Red Cameroon</h3></article>
            <article class="card" data-key="joya-black-cigarillo"><h3><span>Joya de Nicaragua</span>Joya Black Cigarillo</h3></article>
          </div>
        </section>
        <section class="tier-block" data-recommendation-subsection="petit-panatelas">
          <div class="grid" id="recommendation-petit-panatelas">
            <article class="card" data-key="davidoff-escurio-petit-robusto"><h3><span>Davidoff</span>Escurio Petit Robusto</h3></article>
            <article class="card" data-key="foundation-charter-oak-maduro-rothschild"><h3><span>Foundation</span>Charter Oak Maduro Rothschild</h3></article>
            <article class="card" data-key="my-father-la-gran-oferta-lancero"><h3><span>My Father</span>La Gran Oferta Lancero</h3></article>
          </div>
        </section>
        <section class="tier-block" data-recommendation-subsection="flavoured-infused">
          <div class="grid" id="recommendation-flavoured-infused"></div>
        </section>
      </div>
    </main>
  </body></html>`, { url });
  return dom;
}

test('runtime loads the cache-busted v3 control-sidebar module', () => {
  assert.match(runtimeSource, /catalogue-control-sidebar\.mjs\?v=sidebar-controls-3/);
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

test('production heading markup auto-discovers every catalogue brand rather than only configured brands', () => {
  const dom = catalogueFixture();
  const ids = discoverBrandLineFilters(dom.window.document).map(item => item.id);

  for (const id of ['oliva', 'cao', 'drew-estate', 'joya-de-nicaragua', 'foundation', 'my-father']) {
    assert.ok(ids.includes(id), `${id} should be auto-discovered from production h3 > span markup`);
  }
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

  liga.click();
  assert.equal(liga.getAttribute('aria-pressed'), 'true');
  assert.equal(all.getAttribute('aria-pressed'), 'false');
  assert.equal(ligaCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(undercrownCard.classList.contains('brand-line-filter-hidden'), true);
  assert.equal(davidoffCard.classList.contains('brand-line-filter-hidden'), true);
  assert.equal(undercrownCard.classList.contains('hidden'), true, 'existing stock/price hidden state must be preserved');
  assert.equal(new URL(dom.window.location.href).searchParams.get('brandLine'), 'liga-privada');
  assert.equal(new URL(dom.window.location.href).searchParams.get('foo'), 'bar');

  all.click();
  assert.equal(ligaCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(undercrownCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(davidoffCard.classList.contains('brand-line-filter-hidden'), false);
  assert.equal(undercrownCard.classList.contains('hidden'), true, 'clearing brand filter must not clear another filter');
  assert.equal(new URL(dom.window.location.href).searchParams.has('brandLine'), false);
  dom.window.close();
});

test('representative named catalogue lines are exposed separately from their parent brands', () => {
  const dom = catalogueFixture();
  const ids = discoverBrandLineFilters(dom.window.document).map(item => item.id);
  for (const id of [
    'liga-privada-no-9',
    'davidoff-escurio',
    'oliva-serie-g',
    'cao-bella-vanilla',
    'drew-estate-acid',
    'joya-black',
    'foundation-charter-oak',
    'my-father-la-gran-oferta'
  ]) assert.ok(ids.includes(id), `${id} line filter should exist`);
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

test('logo hooks live in the dedicated brand-line config module', async () => {
  const configSource = await readFile(new URL('../public/catalogue-brand-line-config.mjs', import.meta.url), 'utf8');
  assert.match(configSource, /logo:\s*['"]/);
  assert.match(configSource, /\/brand-logos\//);
});
