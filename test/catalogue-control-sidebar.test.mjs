import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as sidebarModule from '../public/catalogue-control-sidebar.mjs';

const {
  moveControlsToSidebar,
  restoreControlsFromSidebar,
  discoverBrandLineFilters,
  brandLogoUrl,
  uploadBrandLogo
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
            <article class="card" data-key="cohiba-club" data-archived="1"><h3><span>Cohiba</span>Club</h3></article>
          </div>
        </section>
        <section class="tier-block" data-recommendation-subsection="petit-panatelas">
          <div class="grid" id="recommendation-petit-panatelas">
            <article class="card" data-key="davidoff-escurio-petit-robusto"><h3><span>Davidoff</span>Escurio Petit Robusto</h3></article>
            <article class="card" data-key="davidoff-nicaragua-short-corona"><h3><span>Davidoff</span>Nicaragua Short Corona</h3></article>
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

test('runtime loads the cache-busted v5 control-sidebar module', () => {
  assert.match(runtimeSource, /catalogue-control-sidebar\.mjs\?v=sidebar-controls-5/);
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

test('production heading markup auto-discovers active catalogue brands only', () => {
  const dom = catalogueFixture();
  const ids = discoverBrandLineFilters(dom.window.document).map(item => item.id);

  for (const id of ['oliva', 'cao', 'drew-estate', 'joya-de-nicaragua', 'foundation', 'my-father']) {
    assert.ok(ids.includes(id), `${id} should be auto-discovered from production h3 > span markup`);
  }
  assert.equal(ids.includes('cohiba'), false, 'archived-only brands must not appear');
  dom.window.close();
});

test('KV archive overrides exclude static archived-only brands even when static HTML is not marked archived', () => {
  const dom = catalogueFixture();
  const state = {
    cards: {
      'oliva-serie-g': { archived:true }
    },
    entries: {}
  };
  const ids = discoverBrandLineFilters(dom.window.document, state).map(item => item.id);
  assert.equal(ids.includes('oliva'), false, 'Oliva is archived-only in authoritative catalogue state');
  assert.ok(ids.includes('cao'), 'active brands must remain available');
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

test('brand filter is single-select, composes with existing hidden state, and persists in the URL', () => {
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
  assert.equal(all.textContent.trim(), 'All Brands');

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

test('multiple product lines collapse into one parent-brand filter', () => {
  const dom = catalogueFixture();
  const filters = discoverBrandLineFilters(dom.window.document);
  const ids = filters.map(item => item.id);

  assert.equal(filters.every(item => item.kind === 'brand'), true);
  assert.equal(ids.filter(id => id === 'davidoff').length, 1);
  for (const lineId of ['davidoff-escurio', 'davidoff-nicaragua', 'liga-privada-no-9', 'oliva-serie-g', 'cao-bella-vanilla']) {
    assert.equal(ids.includes(lineId), false, `${lineId} should not be a separate sidebar filter`);
  }
  dom.window.close();
});

test('sidebar heading is brands only', () => {
  const dom = catalogueFixture();
  moveControlsToSidebar(dom.window.document, dom.window);
  const headings = Array.from(dom.window.document.querySelectorAll('.catalogue-sidebar-heading')).map(node => node.textContent.trim());
  assert.ok(headings.includes('BRANDS'));
  assert.equal(headings.includes('BRANDS & LINES'), false);
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

test('every active brand row has a real upload-logo button and deterministic KV logo URL', () => {
  const dom = catalogueFixture();
  const { document } = dom.window;
  moveControlsToSidebar(document, dom.window);

  const upload = document.querySelector('[data-brand-logo-upload="davidoff"]');
  const filter = document.querySelector('[data-brand-line-filter="davidoff"]');
  const image = filter.querySelector('.catalogue-brand-line-logo');
  assert.ok(upload, 'Davidoff should have an actual Upload logo button');
  assert.equal(upload.textContent.trim(), 'Upload logo');
  assert.equal(image.getAttribute('src'), brandLogoUrl('davidoff'));
  assert.equal(image.hidden, true, 'missing logos stay hidden until the image loads');
  dom.window.close();
});

test('brand logo upload uses the existing authenticated catalogue-image API without config-file paths', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const file = new dom.window.File(['logo-bytes'], 'davidoff.png', { type:'image/png' });
  let captured = null;
  const writeFetch = async (url, init) => {
    captured = { url, init };
    return { ok:true, json:async () => ({ ok:true }) };
  };

  await uploadBrandLogo('davidoff', file, writeFetch);
  assert.equal(captured.url, '/api/catalogue-image/brand-logo-davidoff');
  assert.equal(captured.init.method, 'PUT');
  assert.equal(captured.init.headers['content-type'], 'image/png');
  assert.equal(captured.init.body, file);

  const configSource = await readFile(new URL('../public/catalogue-brand-line-config.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(configSource, /brand-logos\//);
  assert.doesNotMatch(configSource, /logo\s*=/);
  dom.window.close();
});
