#!/usr/bin/env node
// Read-only: prints the exact variant list a Shopify storefront publishes for a product.
//
// A rendered Shopify page shows related-product prices next to the product's own, so
// "$15.60 with a Tin of 10 label" cannot be read off the HTML without guessing whether
// the price belongs to a single or to the tin. The product JSON states each variant's
// title, price and availability outright, which is what a pack-versus-single decision
// turns on. Writes nothing and needs no secrets.

const urls = String(process.env.PROBE_URLS || '')
  .split(/[\s,]+/).map(value => value.trim()).filter(Boolean);
if (!urls.length) throw new Error('PROBE_URLS is required.');

for (const url of urls) {
  const jsonUrl = url.replace(/[?#].*$/, '').replace(/\.json$/, '') + '.json';
  console.log(`\n=== ${jsonUrl}`);
  let payload = null;
  try {
    const response = await fetch(jsonUrl, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (catalogue price check)' }
    });
    console.log(`   HTTP ${response.status}`);
    if (!response.ok) continue;
    payload = await response.json();
  } catch (error) {
    console.log(`   FETCH_FAILED ${error.message}`);
    continue;
  }
  const product = payload?.product;
  if (!product) { console.log('   NO_PRODUCT the response carried no product object'); continue; }
  console.log(`   TITLE ${JSON.stringify(product.title)}`);
  console.log(`   TYPE ${JSON.stringify(product.product_type || '')} VENDOR ${JSON.stringify(product.vendor || '')}`);
  for (const variant of product.variants || []) {
    console.log(`   VARIANT ${JSON.stringify(variant.title)} price=${variant.price} available=${variant.available}`);
  }
  console.log(`   VARIANT_COUNT ${(product.variants || []).length}`);
}
console.log('\nSHOPIFY_VARIANT_PROBE_COMPLETE_READ_ONLY');
