import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function request(name) {
  return JSON.parse(await readFile(new URL(`../catalogue-requests/${name}`, import.meta.url), 'utf8'));
}

const genericCigarHutPath = /cigarhut\.com\.au\/(?:cigarillos-and-cigarros|brands\/|liga-undercrown\/?$|liga-privada-undercrown\/?$)/i;

test('recent Drew Estate cards use product-level retailer links rather than category pages', async () => {
  const files = [
    '2026-09-16-01-liga-privada-h99-coronets.json',
    '2026-09-16-02-liga-privada-10-seleccion-de-mercado-coronets.json',
    '2026-09-16-03-undercrown-10-coronets.json',
    '2026-09-16-08-undercrown-10-corona-viva.json'
  ];

  for (const file of files) {
    const item = await request(file);
    assert.ok(item.entry.retailerLinks.length >= 1, `${file} needs a retailer link`);
    for (const url of item.entry.retailerLinks) {
      assert.equal(genericCigarHutPath.test(url), false, `${file} must not use generic Cigar Hut category link ${url}`);
    }
  }
});

test('Nasty Fritas uses the verified available Index single and current price', async () => {
  const item = await request('2026-09-16-07-liga-privada-unico-nasty-fritas.json');
  assert.equal(item.entry.price, 30.7);
  assert.equal(item.entry.packagePrice, 30.7);
  assert.deepEqual(item.entry.retailerLinks, [
    'https://www.theindexcigars.com.au/products/liga-privada-unico-serie-nasty-fritas'
  ]);
});

test('H99 Papas Fritas keeps the verified exact Index product page', async () => {
  const item = await request('2026-09-16-04-liga-privada-h99-papas-fritas.json');
  assert.equal(item.entry.price, 30.7);
  assert.deepEqual(item.entry.retailerLinks, [
    'https://www.theindexcigars.com.au/products/liga-privada-h99-papa-fritas'
  ]);
});
