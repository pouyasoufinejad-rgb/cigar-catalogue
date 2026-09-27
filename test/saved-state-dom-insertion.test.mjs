import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  applyEditorialToCard,
  applyStructuralOverrideToCard,
  insertBeforeReference
} from '../public/catalogue-admin-unified-v139.mjs';

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


test('saved-state hydration keeps retailer links on the front and markup notes on the back', () => {
  const previousDocument = globalThis.document;
  const dom = new JSDOM(`<!doctype html><body>
    <article class="card" data-key="arturo-fuente-exquisitos-maduro" data-price="22.90" data-rank="4">
      <div class="cardbody">
        <div class="card-faces">
          <div class="card-face card-face-front">
            <h3><span>Arturo Fuente</span>Exquisitos Maduro</h3>
            <a class="shop" href="https://old.example/">Old link</a>
          </div>
          <div class="card-face card-face-back">
            <p class="summary">Existing summary.</p>
          </div>
        </div>
        <button class="card-flip"><span class="card-flip-label">Notes</span></button>
      </div>
    </article>
  </body>`);
  globalThis.document = dom.window.document;
  try {
    const card = dom.window.document.querySelector('article.card');
    applyStructuralOverrideToCard(card, {
      retailerLinks:['https://www.cigarhut.com.au/arturo-fuente-exquisitos_maduro/']
    });
    applyEditorialToCard(card, {
      noteHtml:'The handmade roll usually offers a deliberate draw with modest resistance.'
    });

    assert.ok(card.querySelector('.card-face-front a.shop'), 'retailer link stays on the front face');
    assert.equal(card.querySelector('.cardbody > a.shop'), null, 'no retailer link leaks below the faces');
    assert.ok(card.querySelector('.card-face-back p.mog-note'), 'markup note stays on the back face');
    assert.equal(card.querySelector('.card-face-front p.mog-note'), null, 'markup note never appears on the front');
    assert.equal(card.querySelector('.cardbody > p.mog-note'), null, 'markup note never leaks below the flip control');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    dom.window.close();
  }
});
