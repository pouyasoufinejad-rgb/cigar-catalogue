import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fallbackUrl = new URL('../public/catalogue-retailer-price-fallbacks.mjs', import.meta.url);
const runtimeUrl = new URL('../public/catalogue-runtime.mjs', import.meta.url);

async function loadFallbackModule() {
  try {
    return await import(fallbackUrl.href);
  } catch (_) {
    return null;
  }
}

test('Undercrown Maduro Coronets keeps verified retailer prices when the live stock cache has no price', async () => {
  const mod = await loadFallbackModule();
  assert.equal(mod?.verifiedRetailerPriceFallback?.('https://www.theindexcigars.com.au/products/undercrown-maduro-coronet-tin-of-10'), 119);
  assert.equal(mod?.verifiedRetailerPriceFallback?.('https://www.cigarhut.com.au/undercrown-maduro-coronets/'), 110);
  assert.equal(mod?.verifiedRetailerPriceFallback?.('https://www.cigarworld.com.au/aud/categories/cigars/drew-estate-%28nicaragua%29/undercrown/'), 132);
  assert.equal(mod?.verifiedRetailerPriceFallback?.('https://example.com/not-undercrown'), null);
});

test('runtime loads the targeted retailer-price fallback after the convenience matrix', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  const convenience = source.indexOf("import('./catalogue-convenience.mjs')");
  const fallback = source.indexOf("import('./catalogue-retailer-price-fallbacks.mjs')");
  assert.ok(convenience >= 0, 'convenience module should still load');
  assert.ok(fallback > convenience, 'fallback should load after the retailer matrix module');
});
