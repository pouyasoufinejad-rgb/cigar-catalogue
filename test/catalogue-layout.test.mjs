import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as unifiedAdmin from '../public/catalogue-admin-unified-v139.mjs';

const catalogueHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

function parseDivTree(html) {
  const root = { attributes: {}, children: [], parent: null };
  const stack = [root];
  const divPattern = /<\/?div\b[^>]*>/gi;
  let match;
  while ((match = divPattern.exec(html))) {
    if (/^<\/div/i.test(match[0])) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attributes = {};
    const attributePattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let attribute;
    while ((attribute = attributePattern.exec(match[0]))) {
      attributes[attribute[1]] = attribute[2] ?? attribute[3] ?? '';
    }
    const parent = stack.at(-1);
    const node = { attributes, children: [], parent };
    parent.children.push(node);
    stack.push(node);
  }
  return root;
}

function findDiv(node, attribute, value) {
  if (node.attributes?.[attribute] === value) return node;
  for (const child of node.children || []) {
    const found = findDiv(child, attribute, value);
    if (found) return found;
  }
  return null;
}

function createCountryCard() {
  const countryName = { textContent: 'Old label' };
  const flags = [];
  const classNames = new Set();
  const row = {
    classList: {
      toggle(name, enabled) { enabled ? classNames.add(name) : classNames.delete(name); },
      contains(name) { return classNames.has(name); }
    },
    querySelectorAll(selector) { return selector === '.country-flag' ? [...flags] : []; },
    querySelector(selector) { return selector === '.country-name' ? countryName : null; },
    insertBefore(node) { flags.push(node); }
  };
  const staleFlag = {
    className: 'country-flag flag-bra-dr',
    remove() { flags.splice(flags.indexOf(staleFlag), 1); }
  };
  flags.push(staleFlag);
  return {
    card: { querySelector(selector) { return selector === '.country-row' ? row : null; } },
    row,
    countryName,
    flags,
    staleFlag
  };
}

test('Substantial format sits immediately before the Noteworthy tier', () => {
  const tree = parseDivTree(catalogueHtml);
  const substantial = findDiv(tree, 'data-noteworthy-section', 'substantial');
  const noteworthy = findDiv(tree, 'data-tier-section', 'noteworthy');

  assert.ok(substantial, 'Substantial format group must exist');
  assert.ok(noteworthy, 'Noteworthy tier must exist');
  assert.equal(substantial.parent, noteworthy.parent, 'both sections must be siblings');
  const substantialIndex = substantial.parent.children.indexOf(substantial);
  assert.equal(substantial.parent.children[substantialIndex + 1], noteworthy, 'Noteworthy must be the next sibling');
});

test('BRA/DR country labels resolve to the existing Brazil and Dominican flag assets', () => {
  assert.deepEqual(unifiedAdmin.countryFlagSlugs('BRA/DR'), ['brazil', 'dominican']);
  assert.deepEqual(unifiedAdmin.countryFlagSlugs('Brazil / Dominican Republic'), ['brazil', 'dominican']);
});

test('BRA/DR overrides replace stale flags with two rendered flag assets', () => {
  const originalDocument = globalThis.document;
  const { card, row, countryName, flags, staleFlag } = createCountryCard();
  globalThis.document = {
    createElement() {
      return {
        className: '',
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; }
      };
    }
  };

  try {
    unifiedAdmin.applyDynamicCountryFlag(card, 'BRA/DR');
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }

  assert.equal(flags.includes(staleFlag), false, 'stale composite flag must be removed');
  assert.deepEqual(flags.map(flag => flag.className), [
    'country-flag flag-brazil',
    'country-flag flag-dominican'
  ]);
  assert.ok(flags.every(flag => flag.attributes['aria-hidden'] === 'true'));
  assert.equal(row.classList.contains('country-row-dual'), true);
  assert.equal(countryName.textContent, 'BRA/DR');
  assert.match(catalogueHtml, /\.country-flag\.flag-brazil\{background-image:url\(/);
  assert.match(catalogueHtml, /\.country-flag\.flag-dominican\{background-image:url\(/);
});
