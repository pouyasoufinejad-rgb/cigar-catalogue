import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let presentation = null;
try {
  presentation = await import('../public/catalogue-presentation.mjs');
} catch (_) {
  presentation = null;
}

const valueLoader = await readFile(new URL('../public/catalogue-value.mjs', import.meta.url), 'utf8');
const presentationSource = await readFile(new URL('../public/catalogue-presentation.mjs', import.meta.url), 'utf8').catch(() => '');

test('catalogue loader installs the presentation runtime', () => {
  assert.match(valueLoader, /import\('\.\/catalogue-presentation\.mjs'\)/);
});

test('Substantial format accepts only Size Gold or Strength plus Size Gold', () => {
  assert.ok(presentation, 'catalogue presentation module must load');
  assert.equal(presentation.isSubstantialGoldSet(['size']), true);
  assert.equal(presentation.isSubstantialGoldSet(['strength', 'size']), true);

  for (const labels of [
    ['size', 'quality'],
    ['size', 'flavour'],
    ['size', 'value'],
    ['strength', 'size', 'quality'],
    ['strength', 'size', 'flavour'],
    ['strength', 'size', 'value'],
    ['strength'],
    ['quality', 'flavour']
  ]) {
    assert.equal(presentation.isSubstantialGoldSet(labels), false, `${labels.join('+')} must not be Substantial`);
  }
});

test('cards excluded from Substantial fall back to their normal recommendation destination', () => {
  assert.ok(presentation, 'catalogue presentation module must load');
  assert.equal(presentation.recommendationDestination(['size']), 'substantial');
  assert.equal(presentation.recommendationDestination(['strength', 'size']), 'substantial');
  assert.equal(presentation.recommendationDestination(['quality', 'size']), 'strong');
  assert.equal(presentation.recommendationDestination(['strength', 'size', 'flavour']), 'strong');
  assert.equal(presentation.recommendationDestination(['strength', 'quality', 'size']), 'elite');
  assert.equal(presentation.recommendationDestination(['size', 'value']), 'noteworthy-cheap');
  assert.equal(presentation.recommendationDestination(['size', 'flavour']), 'noteworthy-neither');
});

test('stock state maps to one traffic-light dot colour', () => {
  assert.ok(presentation, 'catalogue presentation module must load');
  assert.equal(presentation.stockColourForStatus('in'), 'green');
  assert.equal(presentation.stockColourForStatus('out'), 'red');
  assert.equal(presentation.stockColourForStatus('delisted'), 'red');
  assert.equal(presentation.stockColourForStatus('unknown'), 'yellow');
  assert.equal(presentation.stockColourForStatus('hold'), 'yellow');
  assert.equal(presentation.stockColourForStatus(''), 'yellow');
});

test('presentation hides dated freshness boxes while retaining compact stock-dot UI', () => {
  assert.match(presentationSource, /article\.card \.freshness\{display:none!important\}/);
  assert.match(presentationSource, /className\s*=\s*['"]stock-dot['"]/);
  assert.match(presentationSource, /aria-label/);
});

test('stock dots contain no visible or hover text', () => {
  assert.match(presentationSource, /dot\.textContent\s*=\s*['"]['"]/);
  assert.doesNotMatch(presentationSource, /setAttribute\(['"]title['"]/);
});

test('stock dots sit to the left of the full ranking caption eyebrow', () => {
  assert.match(presentationSource, /const eyebrow = card\.querySelector\(['"]\.eyebrow['"]\)/);
  assert.match(presentationSource, /eyebrow\.insertBefore\(dot, eyebrow\.firstChild\)/);
  assert.doesNotMatch(presentationSource, /const rankflag = card\.querySelector\(['"]\.rankflag['"]\)/);
});
