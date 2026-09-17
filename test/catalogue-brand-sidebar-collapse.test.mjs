import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { moveControlsToSidebar } from '../public/catalogue-control-sidebar.mjs';
import { installBrandSidebarEditor } from '../public/catalogue-brand-sidebar-editor.mjs';

function fixture() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <main id="host">
      <div id="catalogue-convenience-toolbar"></div>
      <div class="controls"></div>
      <div id="cards">
        <section data-recommendation-subsection="coronets-cigarillos">
          <article class="card" data-key="davidoff-escurio"><h3><span>Davidoff</span>Escurio</h3></article>
        </section>
      </div>
    </main>
  </body></html>`, { url:'https://example.test/catalogue', pretendToBeVisual:true });
  dom.window.fetch = async () => ({ ok:true, status:200, json:async () => ({ sections:{} }) });
  return dom;
}

test('brands dropdown is visually collapsed by default and expands when clicked', async () => {
  const dom = fixture();
  const { document } = dom.window;
  moveControlsToSidebar(document, dom.window);
  installBrandSidebarEditor(document, dom.window);
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));

  const heading = document.querySelector('[data-brand-dropdown-toggle]');
  const list = document.querySelector('[data-brand-line-options]');
  assert.ok(heading);
  assert.ok(list);
  assert.equal(list.hidden, true);
  assert.equal(dom.window.getComputedStyle(list).display, 'none');

  heading.click();
  assert.equal(list.hidden, false);
  assert.notEqual(dom.window.getComputedStyle(list).display, 'none');
  assert.equal(heading.getAttribute('aria-expanded'), 'true');
  dom.window.close();
});

test('brand filter rows do not render as grey boxed buttons', async () => {
  const dom = fixture();
  const { document } = dom.window;
  moveControlsToSidebar(document, dom.window);
  installBrandSidebarEditor(document, dom.window);
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));

  document.querySelector('[data-brand-dropdown-toggle]').click();
  const brandButton = document.querySelector('[data-brand-line-filter="davidoff"]');
  const style = dom.window.getComputedStyle(brandButton);
  assert.equal(style.borderTopStyle, 'none');
  assert.equal(style.backgroundColor, 'rgba(0, 0, 0, 0)');
  dom.window.close();
});
