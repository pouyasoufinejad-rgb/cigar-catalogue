import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  moveControlsToSidebar,
  restoreControlsFromSidebar
} from '../public/catalogue-control-sidebar.mjs';

test('sidebar placement reparents the existing controls without cloning or replacing them', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <main id="host">
      <div id="catalogue-convenience-toolbar"><button data-convenience-view>Compact cards</button></div>
      <div class="controls">
        <div class="sort-pair"><select id="sort"><option>Recommended order</option></select></div>
        <div class="toggle"><button data-filter="instock">In stock</button></div>
      </div>
      <div id="cards"></div>
    </main>
  </body>`);
  const { document } = dom.window;
  const toolbar = document.getElementById('catalogue-convenience-toolbar');
  const controls = document.querySelector('.controls');
  const sort = document.getElementById('sort');
  const filter = document.querySelector('[data-filter="instock"]');

  const sidebar = moveControlsToSidebar(document);

  assert.equal(sidebar.id, 'catalogue-control-sidebar');
  assert.equal(sidebar.children[0], toolbar);
  assert.equal(sidebar.children[1], controls);
  assert.equal(document.getElementById('sort'), sort);
  assert.equal(document.querySelector('[data-filter="instock"]'), filter);
  assert.equal(document.querySelectorAll('#catalogue-convenience-toolbar').length, 1);
  assert.equal(document.querySelectorAll('.controls').length, 1);

  restoreControlsFromSidebar(document);
  const host = document.getElementById('host');
  assert.equal(toolbar.parentElement, host);
  assert.equal(controls.parentElement, host);
  assert.ok(toolbar.compareDocumentPosition(controls) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(controls.compareDocumentPosition(document.getElementById('cards')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(document.getElementById('catalogue-control-sidebar'), null);

  dom.window.close();
});
