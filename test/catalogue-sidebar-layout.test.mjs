import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { DESKTOP_SIDEBAR_MAX_WIDTH, ensureSidebarLayout } from '../public/catalogue-sidebar-layout.mjs';

const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

test('desktop sidebar is widened to 300px while keeping its existing outer-space guard', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  ensureSidebarLayout(dom.window.document);
  const css = dom.window.document.getElementById('catalogue-sidebar-layout-v1')?.textContent || '';
  assert.equal(DESKTOP_SIDEBAR_MAX_WIDTH, 300);
  assert.match(css, /width:min\(300px,calc\(50vw - 660px\)\)!important/);
  dom.window.close();
});

test('runtime loads the cache-busted wider sidebar layout', () => {
  assert.match(runtimeSource, /catalogue-sidebar-layout\.mjs\?v=sidebar-layout-1/);
});
