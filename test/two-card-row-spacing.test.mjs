import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layoutSource = await readFile(new URL('../public/catalogue-card-layout.mjs', import.meta.url), 'utf8');

test('two-card desktop rows count only visible cards before applying inward offsets', () => {
  assert.match(layoutSource, /nth-last-child\(2 of article\.card:not\(\.hidden\):not\(\.brand-line-filter-hidden\):not\(\[data-personal-filter-hidden="1"\]\)\)/);
  assert.match(layoutSource, /nth-child\(3n \+ 1 of article\.card:not\(\.hidden\):not\(\.brand-line-filter-hidden\):not\(\[data-personal-filter-hidden="1"\]\)\)/);
  assert.match(layoutSource, /nth-last-child\(1 of article\.card:not\(\.hidden\):not\(\.brand-line-filter-hidden\):not\(\[data-personal-filter-hidden="1"\]\)\)/);
  assert.match(layoutSource, /grid-column:3!important;[\s\S]*transform:translateX\(-30%\)!important/);
});

test('mobile removes desktop grid-column and transform offsets from every card', () => {
  assert.match(layoutSource, /@media\(max-width:700px\)[\s\S]*html body \.grid > article\.card\{[\s\S]*grid-column:auto!important;[\s\S]*transform:none!important/);
});
