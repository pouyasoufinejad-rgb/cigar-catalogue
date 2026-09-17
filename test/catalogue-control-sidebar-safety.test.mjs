import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { moveControlsToSidebar } from '../public/catalogue-control-sidebar.mjs';

const sidebarSource = await readFile(new URL('../public/catalogue-control-sidebar.mjs', import.meta.url), 'utf8');

function fixture() {
  return new JSDOM(`<!doctype html><html><head></head><body>
    <main id="host">
      <div id="catalogue-convenience-toolbar"></div>
      <div class="controls"><button data-filter="instock">In stock</button></div>
      <div id="cards">
        <section data-recommendation-subsection="coronets-cigarillos">
          <article class="card" data-key="liga-no9"><h3><span>Liga Privada</span>No. 9</h3></article>
          <article class="card" data-key="davidoff-escurio"><h3><span>Davidoff</span>Escurio</h3></article>
        </section>
        <section data-recommendation-subsection="petit-panatelas"></section>
        <section data-recommendation-subsection="flavoured-infused"></section>
      </div>
    </main>
  </body></html>`, { url:'https://example.test/catalogue' });
}

test('Brands is a collapsed-by-default details panel with All Brands available', () => {
  const dom = fixture();
  moveControlsToSidebar(dom.window.document, dom.window);

  const details = dom.window.document.querySelector('details[data-brand-sidebar]');
  assert.ok(details, 'Brands must use a compact details panel');
  assert.equal(details.open, false, 'Brands must start collapsed');
  assert.equal(details.querySelector('summary')?.textContent.trim(), 'BRANDS');
  assert.ok(details.querySelector('[data-brand-line-filter="all"]'), 'All Brands reset must remain available');

  dom.window.close();
});

test('Brands module cannot mutate catalogue-overrides state', () => {
  assert.match(sidebarSource, /const STATE_API = ['"]\/api\/catalogue-overrides['"]/);
  assert.doesNotMatch(
    sidebarSource,
    /(?:PUT|POST|PATCH|DELETE)[\s\S]{0,240}(?:STATE_API|\/api\/catalogue-overrides)|(?:STATE_API|\/api\/catalogue-overrides)[\s\S]{0,240}(?:PUT|POST|PATCH|DELETE)/i,
    'sidebar must never issue a mutating request to catalogue-overrides'
  );
});

test('brand logo writes remain isolated to the dedicated image endpoint', () => {
  assert.match(sidebarSource, /const IMAGE_API = ['"]\/api\/catalogue-image\/['"]/);
  assert.match(sidebarSource, /brand-logo-\$\{safe\}/);
  assert.match(sidebarSource, /method:\s*['"]PUT['"]/);
});
