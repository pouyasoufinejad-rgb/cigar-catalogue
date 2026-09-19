import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

const pageHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
// The card styles ship in the page, so the rendered result is what gets asserted rather
// than the presence of a rule.
const css = [...pageHtml.matchAll(/\.(?:laurel-badge|overall-score|gem-award)[^{]*\{[^}]*\}/g)]
  .map(match => match[0]).join('');

function fixture() {
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body>
    <div class="gem-award gem-tier"><img src="data:image/webp;base64,GEMART" alt=""><span><b>Gem Laurels</b></span></div>
    <div class="gem-award crown-tier"><img src="data:image/webp;base64,CROWNART" alt=""><span><b>Crown Laurels</b></span></div>
    <div id="cards">
      <article class="card" data-key="boxed" data-size-score="9">
        <div class="country-above"><div class="country-row">
          <span class="country-flag flag-cuba"></span><span class="country-name">Cuba</span>
        </div></div>
        <div class="gem-award crown-tier"><img src="data:image/webp;base64,CROWNART" alt=""><span><b>Crown Laurels</b></span></div>
        <div class="medals">
          <div class="rating gold"><span>Strength</span><b>Gold</b><small class="subscore">8/10</small></div>
          <div class="rating gold"><span>Quality</span><b>Gold</b><small class="subscore">8/10</small></div>
          <div class="rating gold"><span>Size</span><b>Gold</b><small class="subscore">9/10</small></div>
          <div class="rating gold"><span>Value</span><b>Gold</b><small class="subscore">8/10</small></div>
        </div>
      </article>
    </div>
  </body></html>`, { url: 'https://example.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  return dom;
}

test('the large award box never renders, even before any script runs', () => {
  const dom = fixture();
  const box = dom.window.document.querySelector('.card .gem-award');
  assert.ok(box, 'the fixture should start with a baked-in award box');
  assert.equal(
    dom.window.getComputedStyle(box).display,
    'none',
    'the box must be off screen from first paint, not only after the runtime removes it'
  );
});

test('a laurel renders as a small badge inside the country row and the box is removed', async () => {
  const dom = fixture();
  const { refreshLaurelForCard } = await import('../public/catalogue-flavour.mjs');
  const card = dom.window.document.querySelector('.card');

  // Four Golds and an unrated Flavour: a Crown.
  refreshLaurelForCard(card, {});

  const badge = card.querySelector('.laurel-badge');
  assert.ok(badge, 'a laurel should render');
  assert.equal(badge.dataset.laurel, 'crown');
  assert.equal(badge.parentElement.className, 'country-row', 'the badge belongs beside the flag');
  assert.equal(card.querySelectorAll('.gem-award').length, 0, 'the old box is removed from the card');
  assert.match(badge.querySelector('img').getAttribute('src'), /CROWNART/, 'it reuses the existing artwork');
  assert.ok(card.classList.contains('crown-laurel'));
});

test('the badge artwork survives the box being removed from an earlier card', async () => {
  const dom = fixture();
  const { refreshLaurelForCard } = await import('../public/catalogue-flavour.mjs');
  const document = dom.window.document;

  // Strip every award box first, exactly as processing a run of cards would.
  document.querySelectorAll('.gem-award').forEach(node => node.remove());

  const card = document.querySelector('.card');
  refreshLaurelForCard(card, {});
  const img = card.querySelector('.laurel-badge img');
  assert.ok(img, 'the badge must still find its artwork from the cached source');
  assert.match(img.getAttribute('src'), /CROWNART/);
});

test('losing a laurel clears the badge rather than leaving a stale one', async () => {
  const dom = fixture();
  const { refreshLaurelForCard } = await import('../public/catalogue-flavour.mjs');
  const card = dom.window.document.querySelector('.card');

  refreshLaurelForCard(card, {});
  assert.ok(card.querySelector('.laurel-badge'));

  // Quality drops out of Gold, leaving three.
  card.querySelector('.rating:nth-child(2) .subscore').textContent = '5/10';
  refreshLaurelForCard(card, {});
  assert.equal(card.querySelector('.laurel-badge'), null);
  assert.equal(card.classList.contains('crown-laurel'), false);
});

test('the overall score renders under the medals and updates with the ratings', async () => {
  const dom = fixture();
  const { refreshLaurelForCard } = await import('../public/catalogue-flavour.mjs');
  const card = dom.window.document.querySelector('.card');

  refreshLaurelForCard(card, {});
  const score = card.querySelector('.overall-score');
  assert.ok(score, 'the score should render');
  assert.equal(score.previousElementSibling.className, 'medals', 'it sits directly under the medals');
  assert.ok(score.classList.contains('is-provisional'), 'Flavour is unrated here');

  // Q8 S9 V8 St8 with Flavour unrated: (24 + 18 + 9.6 + 6.4) / 70 * 100.
  assert.equal(card.dataset.overallScore, '83');
  assert.equal(score.querySelector('b').textContent, '83');

  // Rating Flavour makes it a full score and a Gem.
  refreshLaurelForCard(card, { flavour: 9 });
  assert.equal(card.querySelector('.overall-score').classList.contains('is-provisional'), false);
  assert.equal(card.querySelector('.laurel-badge').dataset.laurel, 'gem');
});
