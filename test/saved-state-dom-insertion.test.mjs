import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { insertBeforeReference } from '../public/catalogue-admin-unified-v139.mjs';

test('saved-state insertion uses the reference node own parent when card faces nest the target', () => {
  const dom = new JSDOM('<div class="cardbody"><div class="card-faces"><div class="card-face"><div class="medals"></div></div></div></div>');
  const doc = dom.window.document;
  const body = doc.querySelector('.cardbody');
  const medals = doc.querySelector('.medals');
  const row = doc.createElement('div');
  row.className = 'freshness';

  assert.doesNotThrow(() => insertBeforeReference(body, row, medals));
  assert.equal(row.parentNode, medals.parentNode);
  assert.equal(row.nextSibling, medals);
});

test('saved-state insertion falls back to appending when no reference exists', () => {
  const dom = new JSDOM('<div class="cardbody"></div>');
  const body = dom.window.document.querySelector('.cardbody');
  const row = dom.window.document.createElement('div');

  assert.doesNotThrow(() => insertBeforeReference(body, row, null));
  assert.equal(body.lastChild, row);
});
