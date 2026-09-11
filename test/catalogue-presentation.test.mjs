import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let presentation = null;
try {
  presentation = await import('../public/catalogue-presentation.mjs');
} catch (_) {
  presentation = null;
}

const runtimeLoader = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const presentationSource = await readFile(new URL('../public/catalogue-presentation.mjs', import.meta.url), 'utf8').catch(() => '');

test('catalogue loader installs presentation and Half-Cigar cohort runtimes', () => {
  assert.match(runtimeLoader, /import\('\.\/catalogue-presentation\.mjs'\)/);
  assert.match(runtimeLoader, /import\('\.\/catalogue-half-cohort\.mjs'\)/);
});

test('recommendation routing no longer creates a rating-driven Substantial destination', () => {
  assert.ok(presentation, 'catalogue presentation module must load');
  assert.equal(presentation.recommendationDestination(['size']), 'noteworthy-neither');
  assert.equal(presentation.recommendationDestination(['strength', 'size']), 'strong');
  assert.equal(presentation.recommendationDestination(['quality', 'size']), 'strong');
  assert.equal(presentation.recommendationDestination(['strength', 'size', 'flavour']), 'strong');
  assert.equal(presentation.recommendationDestination(['strength', 'quality', 'size']), 'elite');
  assert.equal(presentation.recommendationDestination(['size', 'value']), 'noteworthy-cheap');
  assert.equal(presentation.recommendationDestination(['size', 'flavour']), 'noteworthy-neither');
  assert.notEqual(presentation.recommendationDestination(['size']), 'substantial');
});

test('dynamic main entries are reclassified even when a non-rank sort is active', () => {
  assert.doesNotMatch(presentationSource, /if \(sort\?\.value && sort\.value !== ['"]rank['"]\) return 0;/);
  assert.match(presentationSource, /if \(!rankSortActive && card\.dataset\.dynamicEntry !== ['"]1['"]\) return;/);
});

test('recommendation presentation does not own Half-Cigar sectioning or filtering', () => {
  assert.doesNotMatch(presentationSource, /containsHalfCigarCue/);
  assert.doesNotMatch(presentationSource, /isHalfCigarCard/);
  assert.doesNotMatch(presentationSource, /data-half-cigar-filter/);
  assert.doesNotMatch(presentationSource, /data-noteworthy-section=["']substantial["']/);
  assert.doesNotMatch(presentationSource, /normaliseCardRankCaption/);
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

test('Experience relabels High nicotine as Nicotine Bomb without touching other levels', () => {
  assert.ok(presentation, 'catalogue presentation module must load');
  assert.equal(presentation.normaliseExperienceTagText('Nicotine: High'), 'Nicotine Bomb');
  assert.equal(presentation.normaliseExperienceTagText('Nicotine: High (projected)'), 'Nicotine Bomb (projected)');
  assert.equal(presentation.normaliseExperienceTagText('Nicotine: Medium-High'), 'Nicotine: Medium-High');
  assert.equal(presentation.normaliseExperienceTagText('Pairings: Espresso, dark chocolate'), 'Pairings: Espresso, dark chocolate');
  assert.match(presentationSource, /normaliseExperienceTags\(document\)/);

  const label = { textContent: 'Experience' };
  const high = { textContent: 'Nicotine: High' };
  const projected = { textContent: 'Nicotine: High (projected)' };
  const mediumHigh = { textContent: 'Nicotine: Medium-High' };
  const group = {
    querySelector(selector) {
      return selector === '.tag-label' ? label : null;
    },
    querySelectorAll(selector) {
      return selector === '.tag-chip' ? [high, projected, mediumHigh] : [];
    }
  };
  const root = {
    querySelectorAll(selector) {
      return selector === '.tag-group' ? [group] : [];
    }
  };

  assert.equal(presentation.normaliseExperienceTags(root), 2);
  assert.equal(high.textContent, 'Nicotine Bomb');
  assert.equal(projected.textContent, 'Nicotine Bomb (projected)');
  assert.equal(mediumHigh.textContent, 'Nicotine: Medium-High');
});
