import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { removeParentTierUi, installParentTierGuard } from '../public/catalogue-no-parent-tier.mjs';

test('removes explicit parent-tier badges and Parent tier text from every card', () => {
  const dom = new JSDOM('<main>'
    + '<article class="card" data-key="a"><span class="parent-tier-badge">Parent tier: Noteworthy</span></article>'
    + '<article class="card" data-key="b"><small>Parent tier: Noteworthy</small><span>Keep me</span></article>'
    + '</main>');
  removeParentTierUi(dom.window.document);
  assert.equal(dom.window.document.querySelector('.parent-tier-badge'), null);
  assert.equal(dom.window.document.body.textContent.includes('Parent tier:'), false);
  assert.equal(dom.window.document.body.textContent.includes('Keep me'), true);
});

test('removes parent-tier UI added after hydration', async () => {
  const dom = new JSDOM('<main id="host"></main>');
  const observer = installParentTierGuard(dom.window.document);
  const host = dom.window.document.getElementById('host');
  const card = dom.window.document.createElement('article');
  card.className = 'card';
  card.dataset.key = 'late';
  card.innerHTML = '<span data-parent-tier="noteworthy">Parent tier: Noteworthy</span>';
  host.appendChild(card);
  await new Promise(resolve => dom.window.queueMicrotask(resolve));
  assert.equal(dom.window.document.body.textContent.includes('Parent tier:'), false);
  observer?.disconnect();
});
