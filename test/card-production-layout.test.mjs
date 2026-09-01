import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stockClient = await readFile(new URL('../public/catalogue-stock-client.mjs', import.meta.url), 'utf8');
const valueLoader = await readFile(new URL('../public/catalogue-value.mjs', import.meta.url), 'utf8');
const wideLayout = await readFile(new URL('../public/catalogue-card-layout.mjs', import.meta.url), 'utf8').catch(() => '');

test('card cleanup removes only an exact Unflavoured production line', () => {
  assert.match(stockClient, /textContent\.trim\(\)\.toLowerCase\(\) === 'unflavoured'/);
  assert.match(stockClient, /production[^\n]*querySelectorAll\('\.artmeta-line'\)/);
});

test('desktop catalogue grid stays at three columns with a very small gap and slightly wider cards', () => {
  assert.match(valueLoader, /import\('\.\/catalogue-card-layout\.mjs'\)/);
  assert.match(wideLayout, /grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(wideLayout, /gap:\s*8px!important/);
  assert.match(wideLayout, /width:\s*calc\(100% \+ 60px\)!important/);
  assert.match(wideLayout, /margin-inline:\s*-30px!important/);
  assert.match(wideLayout, /max-width:\s*none!important/);
});

test('a final desktop row with two cards uses the outside columns for more separation', () => {
  assert.match(wideLayout, /\.grid\s*>\s*article\.card:last-of-type:nth-of-type\(3n\s*\+\s*2\)\{[\s\S]*grid-column:\s*3!important/);
});

test('laurel boxes are wider, less tall, and keep the score closer to the laurel image', () => {
  assert.match(wideLayout, /article\.card \.medals\{[\s\S]*gap:4px!important/);
  assert.match(wideLayout, /article\.card \.medals \.rating\{[\s\S]*min-height:148px!important/);
  assert.match(wideLayout, /article\.card \.medals \.medal\{[\s\S]*height:92px!important/);
  assert.match(wideLayout, /article\.card \.medals \.medal\{[\s\S]*margin:2px auto -3px!important/);
  assert.match(wideLayout, /article\.card \.medals \.rating b\{font-size:\s*11px!important;margin-top:-2px!important/);
  assert.match(wideLayout, /article\.card \.medals \.subscore\{font-size:\s*9px!important;margin-top:-1px!important/);
});

test('wider cards keep readable rating and copy text', () => {
  assert.match(wideLayout, /article\.card \.medals \.rating>span\{font-size:\s*10px!important/);
  assert.match(wideLayout, /article\.card \.cardbody \.summary\{font-size:\s*14px!important;line-height:\s*1\.5!important/);
  assert.match(wideLayout, /article\.card \.artmeta\{font-size:\s*11px!important;line-height:\s*1\.35!important/);
});

test('mobile remains one full-width column with no horizontal overhang and compact laurels', () => {
  assert.match(wideLayout, /@media\(max-width:700px\)[\s\S]*grid-template-columns:\s*minmax\(0,1fr\)!important/);
  assert.match(wideLayout, /@media\(max-width:700px\)[\s\S]*gap:\s*6px!important/);
  assert.match(wideLayout, /@media\(max-width:700px\)[\s\S]*width:\s*100%!important/);
  assert.match(wideLayout, /@media\(max-width:700px\)[\s\S]*margin-inline:\s*0!important/);
  assert.match(wideLayout, /@media\(max-width:700px\)[\s\S]*article\.card:last-of-type:nth-of-type\(3n\s*\+\s*2\)\{[\s\S]*grid-column:\s*auto!important/);
  assert.match(wideLayout, /@media\(max-width:700px\)[\s\S]*article\.card \.medals \.rating\{[\s\S]*min-height:140px!important/);
  assert.match(wideLayout, /@media\(max-width:700px\)[\s\S]*article\.card \.medals \.medal\{[\s\S]*height:84px!important/);
});

test('existing art-frame heights and mobile metadata placement remain unchanged', () => {
  assert.match(stockClient, /--catalogue-artframe-min-height:\s*390px/);
  assert.match(stockClient, /min-height:\s*410px!important/);
  assert.match(stockClient, /article\.card \.artmeta-left,[\s\S]*article\.card \.artmeta-right\{[\s\S]*transform:\s*translateY\(14px\)!important/);
});
