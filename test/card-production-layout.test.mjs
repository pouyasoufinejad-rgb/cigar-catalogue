import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stockClient = await readFile(new URL('../public/catalogue-stock-client.mjs', import.meta.url), 'utf8');
const runtimeLoader = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const wideLayout = await readFile(new URL('../public/catalogue-card-layout.mjs', import.meta.url), 'utf8').catch(() => '');

test('card cleanup removes only an exact Unflavoured production line', () => {
  assert.match(stockClient, /textContent\.trim\(\)\.toLowerCase\(\) === 'unflavoured'/);
  assert.match(stockClient, /production[^\n]*querySelectorAll\('\.artmeta-line'\)/);
});

test('desktop catalogue grid stays at three columns with a very small gap and slightly wider cards', () => {
  assert.match(runtimeLoader, /import\('\.\/catalogue-card-layout\.mjs\?v=both-bleed-2'\)/);
  assert.match(wideLayout, /grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(wideLayout, /gap:\s*8px!important/);
  assert.match(wideLayout, /width:\s*calc\(100% \+ var\(--card-bleed-left\) \+ var\(--card-bleed-right\)\)!important/);
  assert.match(wideLayout, /margin-right:\s*calc\(-1 \* var\(--card-bleed-right\)\)!important/);
  assert.match(wideLayout, /max-width:\s*none!important/);
});

test('the left overhang only stays narrow where there is a sidebar to clear', () => {
  // The 24px cap exists solely so the cards do not slide under the fixed sidebar, and that
  // sidebar only mounts at 1660px and up. Below it the left can take the same room as the
  // right, which on a 1440px laptop is most of the free space rather than a sliver.
  assert.match(wideLayout, /--card-bleed-left:\s*min\(24px, var\(--card-room\)\)/,
    'the base rule keeps the sidebar-safe cap');
  const below = wideLayout.match(/@media\(min-width:901px\) and \(max-width:1659px\)\{[\s\S]*?--card-bleed-left:\s*min\((\d+)px, var\(--card-room\)\)!important/);
  assert.ok(below, 'there should be a wider left overhang below the sidebar breakpoint');
  assert.ok(Number(below[1]) > 24, `it has to be wider than the capped 24px, got ${below[1]}px`);
  // And it must stay bounded by the room actually free, or a narrow desktop scrolls sideways.
  assert.match(wideLayout, /--card-room:max\(0px, \(100vw - 100%\) \/ 2 - 16px\)/);
});

test('a final desktop row with two visible cards keeps outside-column balance but ignores hidden siblings', () => {
  assert.match(wideLayout, /nth-last-child\(2 of article\.card:not\(\.hidden\):not\(\.brand-line-filter-hidden\):not\(\[data-personal-filter-hidden="1"\]\)\)/);
  assert.match(wideLayout, /nth-child\(3n \+ 1 of article\.card:not\(\.hidden\):not\(\.brand-line-filter-hidden\):not\(\[data-personal-filter-hidden="1"\]\)\)/);
  assert.match(wideLayout, /nth-last-child\(1 of article\.card:not\(\.hidden\):not\(\.brand-line-filter-hidden\):not\(\[data-personal-filter-hidden="1"\]\)\)/);
  assert.match(wideLayout, /grid-column:\s*3!important;[\s\S]*transform:\s*translateX\(-30%\)!important/);
});

test('laurel boxes reserve no room for the frame and tier word they no longer have', () => {
  assert.match(wideLayout, /article\.card \.medals\{[\s\S]*gap:4px!important/);
  // The box is only as tall as the label and the wreath now.
  assert.match(wideLayout, /article\.card \.medals \.rating\{[\s\S]*min-height:0!important/);
  assert.match(wideLayout, /article\.card \.medals \.medal\{[\s\S]*height:86px!important/);
  assert.match(wideLayout, /article\.card \.medals \.medal\{[\s\S]*margin:0 auto!important/);
  // Sizing the tier word is dead weight once it is hidden.
  assert.doesNotMatch(wideLayout, /article\.card \.medals \.rating b\{/);
  // The score sits inside the wreath, so it is set at reading size rather than as a caption.
  assert.match(wideLayout, /article\.card \.medals \.subscore\{font-size:\s*13px!important/);
});

test('wider cards keep readable rating and copy text', () => {
  assert.match(wideLayout, /article\.card \.medals \.rating>span\{font-size:\s*10px!important/);
  assert.match(wideLayout, /article\.card \.cardbody \.summary\{font-size:\s*14px!important;line-height:\s*1\.5!important/);
  assert.match(wideLayout, /article\.card \.artmeta\{font-size:\s*11px!important;line-height:\s*1\.35!important/);
});

test('mobile remains one full-width column with no horizontal overhang and compact laurels', () => {
  assert.match(wideLayout, /@media\(max-width:900px\)[\s\S]*grid-template-columns:\s*minmax\(0,1fr\)!important/);
  assert.match(wideLayout, /@media\(max-width:900px\)[\s\S]*gap:\s*6px!important/);
  assert.match(wideLayout, /@media\(max-width:900px\)[\s\S]*width:\s*100%!important/);
  assert.match(wideLayout, /@media\(max-width:900px\)[\s\S]*margin-inline:\s*0!important/);
  assert.match(wideLayout, /@media\(max-width:900px\)[\s\S]*html body \.grid > article\.card\{[\s\S]*grid-column:\s*auto!important;[\s\S]*transform:\s*none!important/);
  assert.match(wideLayout, /@media\(max-width:900px\)[\s\S]*article\.card \.medals \.rating\{[\s\S]*min-height:0!important/);
  assert.match(wideLayout, /@media\(max-width:900px\)[\s\S]*article\.card \.medals \.medal\{[\s\S]*height:58px!important/);
});

test('existing art-frame heights and mobile metadata placement remain unchanged', () => {
  assert.match(stockClient, /--catalogue-artframe-min-height:\s*390px/);
  assert.match(stockClient, /min-height:\s*410px!important/);
  assert.match(stockClient, /article\.card \.artmeta-left,[\s\S]*article\.card \.artmeta-right\{[\s\S]*transform:\s*translateY\(14px\)!important/);
});
