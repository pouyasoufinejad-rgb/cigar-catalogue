import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cleanup = await import('../public/catalogue-legacy-copy.mjs');
const runtimeLoader = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

test('removes only the redundant Substantial copy while preserving the legacy mount', () => {
  const heading = {
    textContent: 'Substantial format',
    removed: false,
    remove() { this.removed = true; }
  };
  const note = {
    textContent: 'Size Gold, Value not Gold. Bigger smokes at mid prices.',
    removed: false,
    remove() { this.removed = true; }
  };
  const mount = {
    querySelector(selector) {
      if (selector === ':scope > .subtier-heading') return heading;
      if (selector === ':scope > .subtier-note') return note;
      return null;
    }
  };
  const root = {
    querySelector(selector) {
      return selector === '[data-noteworthy-section="substantial"]' ? mount : null;
    }
  };

  assert.equal(cleanup.removeLegacySubstantialCopy(root), 2);
  assert.equal(heading.removed, true);
  assert.equal(note.removed, true);
  assert.equal(root.querySelector('[data-noteworthy-section="substantial"]'), mount);
});

test('cleanup leaves similarly placed unrelated copy alone', () => {
  const heading = {
    textContent: 'Different heading',
    removed: false,
    remove() { this.removed = true; }
  };
  const note = {
    textContent: 'Different note',
    removed: false,
    remove() { this.removed = true; }
  };
  const mount = {
    querySelector(selector) {
      if (selector === ':scope > .subtier-heading') return heading;
      if (selector === ':scope > .subtier-note') return note;
      return null;
    }
  };
  const root = {
    querySelector(selector) {
      return selector === '[data-noteworthy-section="substantial"]' ? mount : null;
    }
  };

  assert.equal(cleanup.removeLegacySubstantialCopy(root), 0);
  assert.equal(heading.removed, false);
  assert.equal(note.removed, false);
});

test('catalogue loader installs the legacy copy cleanup', () => {
  assert.match(runtimeLoader, /import\('\.\/catalogue-legacy-copy\.mjs'\)/);
});
