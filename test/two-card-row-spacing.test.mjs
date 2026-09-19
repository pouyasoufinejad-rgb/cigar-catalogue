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
  assert.match(layoutSource, /@media\(max-width:900px\)[\s\S]*html body \.grid > article\.card\{[\s\S]*grid-column:auto!important;[\s\S]*transform:none!important/);
});

test('the trailing-row centring never reaches a phone', () => {
  // grid-column:3 placed a card in a third column that the mobile one-column template
  // does not define, which creates implicit columns: a one-track grid computed as
  // "0px 254px 254px" and rendered three cards to a row. Measured on the live page, it hit
  // exactly the grids whose card count makes the last card an nth-child(3n+2) - Panatelas
  // at 20 and the half cigars at 14 - and no others. The selector is a long chain of
  // :not() and :nth-child(... of ...), so a grid-column:auto reset cannot outrank it.
  const guard = layoutSource.indexOf('@media(min-width:901px){');
  const rule = layoutSource.indexOf('grid-column:3!important');
  assert.ok(guard >= 0, 'the trailing-row rules need a wide-screen guard');
  assert.ok(rule > guard, 'grid-column:3 must sit inside that guard');
  const closing = layoutSource.indexOf('}', layoutSource.indexOf('translateX(-30%)'));
  assert.ok(closing > rule, 'and the guard must still wrap it');
});
