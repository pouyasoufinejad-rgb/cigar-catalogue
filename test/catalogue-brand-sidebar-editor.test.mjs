import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import {
  installBrandSidebarEditor,
  normaliseHiddenBrandIds,
  saveHiddenBrandIds
} from '../public/catalogue-brand-sidebar-editor.mjs';

const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

function fixture() {
  return new JSDOM(`<!doctype html><html><head></head><body>
    <div id="catalogue-sidebar-extra-controls">
      <section class="catalogue-sidebar-section">
        <div class="catalogue-sidebar-heading">CATALOGUE</div>
      </section>
      <section class="catalogue-sidebar-section" id="brand-section">
        <div class="catalogue-sidebar-heading">BRANDS</div>
        <div class="catalogue-sidebar-list" data-brand-line-options>
          <button class="catalogue-sidebar-choice" data-brand-line-filter="all"><span>All Brands</span></button>
          <div class="catalogue-brand-row">
            <button class="catalogue-sidebar-choice" data-brand-line-filter="davidoff"><span class="catalogue-brand-label">Davidoff</span></button>
            <div class="catalogue-brand-logo-actions">
              <button data-brand-logo-upload="davidoff">Upload logo</button>
              <button data-brand-logo-adjust="davidoff">Adjust</button>
            </div>
            <div class="catalogue-brand-logo-controls" data-brand-logo-controls="davidoff" hidden></div>
          </div>
          <div class="catalogue-brand-row">
            <button class="catalogue-sidebar-choice" data-brand-line-filter="liga-privada"><span class="catalogue-brand-label">Liga Privada</span></button>
            <div class="catalogue-brand-logo-actions">
              <button data-brand-logo-upload="liga-privada">Upload logo</button>
              <button data-brand-logo-adjust="liga-privada">Adjust</button>
            </div>
            <div class="catalogue-brand-logo-controls" data-brand-logo-controls="liga-privada" hidden></div>
          </div>
        </div>
      </section>
    </div>
  </body></html>`, { url:'https://example.test/catalogue' });
}

test('runtime loads the sidebar manager after the existing sidebar module', () => {
  assert.match(runtimeSource, /catalogue-control-sidebar\.mjs\?v=sidebar-controls-6&brand-editor=1/);
  assert.match(runtimeSource, /catalogue-brand-sidebar-editor\.mjs\?v=brand-editor-1/);
});

test('brands section is compact by default and expands only when its heading is clicked', async () => {
  const dom = fixture();
  dom.window.fetch = async () => ({ ok:true, json:async () => ({ sections:{} }) });
  installBrandSidebarEditor(dom.window.document, dom.window);
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));

  const heading = dom.window.document.querySelector('#brand-section .catalogue-sidebar-heading');
  const list = dom.window.document.querySelector('[data-brand-line-options]');
  assert.equal(list.hidden, true);
  assert.equal(heading.getAttribute('role'), 'button');
  assert.equal(heading.getAttribute('aria-expanded'), 'false');

  heading.click();
  assert.equal(list.hidden, false);
  assert.equal(heading.getAttribute('aria-expanded'), 'true');
  heading.click();
  assert.equal(list.hidden, true);
  dom.window.close();
});

test('logo upload/replace, adjust and remove controls are editor-only', async () => {
  const dom = fixture();
  dom.window.fetch = async () => ({ ok:true, json:async () => ({ sections:{} }) });
  installBrandSidebarEditor(dom.window.document, dom.window);
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));

  const style = dom.window.document.getElementById('catalogue-brand-sidebar-editor-style')?.textContent || '';
  assert.match(style, /body:not\(\.catalogue-direct-edit-mode\).*\.catalogue-brand-logo-actions/);
  assert.match(style, /body:not\(\.catalogue-direct-edit-mode\).*\.catalogue-brand-logo-controls/);
  assert.ok(dom.window.document.querySelector('[data-brand-remove="davidoff"]'));
  assert.equal(dom.window.document.querySelector('[data-brand-logo-adjust="davidoff"]').textContent.trim(), 'Adjust logo');
  dom.window.close();
});

test('hidden brand ids are normalised and saved without overwriting other section state', async () => {
  assert.deepEqual(normaliseHiddenBrandIds(['Davidoff', 'davidoff', 'Liga Privada', '', null]), ['davidoff', 'liga-privada']);

  let captured = null;
  const state = {
    sections: {
      recommendationSubsections:[{ id:'coronets-cigarillos' }],
      brandLogos:{ davidoff:{ size:32, x:1, y:2 } }
    }
  };
  const writeFetch = async (url, init) => {
    captured = { url, init };
    return { ok:true, status:200, json:async () => ({ sections:JSON.parse(init.body).sections }) };
  };
  await saveHiddenBrandIds(['davidoff', 'liga-privada'], state, writeFetch);
  const body = JSON.parse(captured.init.body);
  assert.equal(captured.url, '/api/catalogue-overrides');
  assert.equal(captured.init.method, 'PUT');
  assert.deepEqual(body.sections.recommendationSubsections, [{ id:'coronets-cigarillos' }]);
  assert.deepEqual(body.sections.brandLogos.davidoff, { size:32, x:1, y:2 });
  assert.deepEqual(body.sections.hiddenBrands, ['davidoff', 'liga-privada']);
});

test('editor can remove a brand from the dropdown and restore it later', async () => {
  const dom = fixture();
  dom.window.document.body.classList.add('catalogue-direct-edit-mode');
  dom.window.sessionStorage.setItem('cigar-catalogue-admin-token', 'test-token');
  dom.window.confirm = () => true;
  let state = { sections:{} };
  dom.window.fetch = async (url, init = {}) => {
    if ((init.method || 'GET') === 'PUT') {
      const body = JSON.parse(init.body);
      state = { ...state, sections:body.sections };
      return { ok:true, status:200, json:async () => state };
    }
    return { ok:true, status:200, json:async () => state };
  };

  installBrandSidebarEditor(dom.window.document, dom.window);
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  const row = dom.window.document.querySelector('[data-brand-line-filter="davidoff"]').closest('.catalogue-brand-row');
  dom.window.document.querySelector('[data-brand-remove="davidoff"]').click();
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  assert.equal(row.hidden, true);
  assert.deepEqual(state.sections.hiddenBrands, ['davidoff']);

  const restore = dom.window.document.querySelector('[data-brand-restore="davidoff"]');
  assert.ok(restore);
  restore.click();
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  assert.equal(row.hidden, false);
  assert.deepEqual(state.sections.hiddenBrands, []);
  dom.window.close();
});
