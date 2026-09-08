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

test('Half-Cigar cue matcher accepts half and halv forms case-insensitively', () => {
  assert.ok(presentation, 'catalogue presentation module must load');
  assert.equal(presentation.containsHalfCigarCue('Half Corona'), true);
  assert.equal(presentation.containsHalfCigarCue('halve before lighting'), true);
  assert.equal(presentation.containsHalfCigarCue('HALVED FORMAT'), true);
  assert.equal(presentation.containsHalfCigarCue('halving format'), true);
  assert.equal(presentation.containsHalfCigarCue('ordinary corona'), false);
});

test('Half-Cigar classification includes every entry containing half or halve wording', () => {
  assert.ok(presentation, 'catalogue presentation module must load');

  const practicalCard = {
    dataset: { key: 'example-corona' },
    querySelector(selector) {
      if (selector === 'h3') return { textContent: 'Example Corona' };
      if (selector === '.artmeta-right') return { textContent: 'Single · Halve before smoking' };
      if (selector === '.mog-note') return { textContent: '' };
      if (selector === '.summary') return { textContent: 'Ordinary tasting prose' };
      return null;
    }
  };
  assert.equal(presentation.isHalfCigarCard(practicalCard), true);

  const titleCard = {
    dataset: { key: 'h-upmann-half-corona' },
    querySelector(selector) {
      if (selector === 'h3') return { textContent: 'H. Upmann Half Corona' };
      if (selector === '.artmeta-right') return { textContent: 'Single' };
      if (selector === '.mog-note') return { textContent: '' };
      return null;
    }
  };
  assert.equal(presentation.isHalfCigarCard(titleCard), true);

  const summaryOnlyCard = {
    dataset: { key: 'ordinary-corona' },
    querySelector(selector) {
      if (selector === 'h3') return { textContent: 'Ordinary Corona' };
      if (selector === '.artmeta-right') return { textContent: 'Single · Uncut' };
      if (selector === '.mog-note') return { textContent: '' };
      if (selector === '.summary') return { textContent: 'Pepper grows in the second half.' };
      return null;
    }
  };
  assert.equal(presentation.isHalfCigarCard(summaryOnlyCard), true);
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

test('presentation runtime changes only the requested Half-Cigar grouping and filter', () => {
  assert.match(presentationSource, /The Half-Cigar/);
  assert.match(presentationSource, /data-noteworthy-section=["']substantial["']/);
  assert.match(presentationSource, /data-tier-section=["']strong["']/);
  assert.match(presentationSource, /strongSection\.nextSibling/);
  assert.match(presentationSource, /data-half-cigar-filter/);
  assert.match(presentationSource, /Half Cigars/);
  assert.match(presentationSource, /data-half-cigar/);
  assert.doesNotMatch(presentationSource, /data-ranking-section/);
  assert.doesNotMatch(presentationSource, /data-recommendations-heading/);
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
