import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const requestsDirectory = new URL('../catalogue-requests/', import.meta.url);

async function effectiveEntry(key) {
  const names = (await readdir(requestsDirectory))
    .filter(name => name.endsWith('.json'))
    .sort();
  const effective = {};
  for (const name of names) {
    const item = JSON.parse(await readFile(new URL(name, requestsDirectory), 'utf8'));
    if (item.key !== key || item.operation !== 'upsert-entry' || !item.entry) continue;
    Object.assign(effective, item.entry);
  }
  return effective;
}

const genericCigarHutPath = /cigarhut\.com\.au\/(?:cigarillos-and-cigarros|brands\/|liga-undercrown\/?$|liga-privada-undercrown\/?$)/i;

test('recent Drew Estate cards resolve to product-level retailer links rather than category pages', async () => {
  const keys = [
    'liga-privada-h99-coronets',
    'liga-privada-10-seleccion-de-mercado-coronets',
    'undercrown-10-coronets',
    'undercrown-10-corona-viva'
  ];

  for (const key of keys) {
    const entry = await effectiveEntry(key);
    assert.ok(entry.retailerLinks?.length >= 1, `${key} needs a retailer link`);
    for (const url of entry.retailerLinks) {
      assert.equal(genericCigarHutPath.test(url), false, `${key} must not use generic Cigar Hut category link ${url}`);
    }
  }
});

test('Nasty Fritas resolves to the best available Cigar Hut single and retains Index fallback', async () => {
  const entry = await effectiveEntry('liga-privada-unico-nasty-fritas');
  assert.equal(entry.price, 29);
  assert.equal(entry.packagePrice, 29);
  assert.deepEqual(entry.retailerLinks, [
    'https://www.cigarhut.com.au/liga-privada-unico-serie-nasty-fritas/',
    'https://www.theindexcigars.com.au/products/liga-privada-unico-serie-nasty-fritas'
  ]);
});

test('H99 Papas Fritas resolves to the best available Cigar Hut single and retains Index fallback', async () => {
  const entry = await effectiveEntry('liga-privada-h99-papas-fritas');
  assert.equal(entry.price, 29);
  assert.equal(entry.packagePrice, 29);
  assert.deepEqual(entry.retailerLinks, [
    'https://www.cigarhut.com.au/liga-privada-h99-connecticut-corojo-papas-fritas/',
    'https://www.theindexcigars.com.au/products/liga-privada-h99-papa-fritas'
  ]);
});
