import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stockClient = await readFile(new URL('../public/catalogue-stock-client.mjs', import.meta.url), 'utf8');
const flavourRuntime = await readFile(new URL('../public/catalogue-flavour.mjs', import.meta.url), 'utf8');

test('card cleanup removes only an exact Unflavoured production line', () => {
  assert.match(stockClient, /textContent\.trim\(\)\.toLowerCase\(\) === 'unflavoured'/);
  assert.match(stockClient, /production[^\n]*querySelectorAll\('\.artmeta-line'\)/);
});

test('catalogue cards use a wider horizontal footprint without becoming taller', () => {
  assert.match(stockClient, /--catalogue-card-max-width:\s*500px/);
  assert.match(stockClient, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,420px\),1fr\)\)/);
  assert.match(stockClient, /--catalogue-artframe-min-height:\s*390px/);
  assert.match(stockClient, /@media \(max-width:\s*700px\)/);
  assert.match(stockClient, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(stockClient, /min-height:\s*410px!important/);
});

test('wider cards use the extra room for more readable rating and copy text', () => {
  assert.match(stockClient, /\.medals \.rating>span\{font-size:\s*10px!important/);
  assert.match(stockClient, /\.medals \.rating b\{font-size:\s*11px!important/);
  assert.match(stockClient, /\.medals \.subscore\{font-size:\s*9px!important/);
  assert.match(stockClient, /article\.card \.cardbody \.summary\{font-size:\s*14px!important;line-height:\s*1\.5!important/);
  assert.match(stockClient, /article\.card \.artmeta\{font-size:\s*11px!important;line-height:\s*1\.35!important/);
  assert.match(flavourRuntime, /@media\(max-width:700px\)\{\.medals\{gap:5px!important\}\.medals \.rating\{min-width:0!important\}\.medals \.rating>span\{font-size:9px!important\}\.medals \.rating b\{font-size:10px!important\}\.medals \.subscore\{font-size:9px!important\}\}/);
});

test('mobile Production and Practical blocks keep their existing vertical placement', () => {
  assert.match(stockClient, /article\.card \.artmeta-left,[\s\S]*article\.card \.artmeta-right\{[\s\S]*transform:\s*translateY\(14px\)!important/);
});
