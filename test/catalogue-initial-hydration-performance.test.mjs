import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const admin = await readFile(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');
const stock = await readFile(new URL('../public/catalogue-stock-client.mjs', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('initial catalogue boot trusts Worker-rendered structural fields instead of rewriting every card', () => {
  assert.match(admin, /async function loadStateForBrowser\(\{\s*showMessage\s*=\s*false,\s*applyStructural\s*=\s*true\s*\}\s*=\s*\{\}\)/);
  assert.match(admin, /if\s*\(applyStructural\)\s*applyStructuralOverrideToCard\(card,\s*effectiveStructure\(card,\s*stateForBrowser\)\)/);
  assert.match(admin, /loadStateForBrowser\(\{\s*applyStructural:\s*false\s*\}\)/);
});

test('manual editor reload can still reapply structural fields without a full navigation', () => {
  assert.match(admin, /reloadEditorState\(\)[\s\S]*?loadStateForBrowser\(\{\s*showMessage:\s*true,\s*applyStructural:\s*true\s*\}\)/);
});

test('successful saves refresh current KV state in place instead of forcing a full catalogue reload', () => {
  const saveBody = admin.match(/async function saveUnified\(\) \{([\s\S]*?)\n\}\nasync function deleteDynamic/)?.[1] || '';
  assert.match(saveBody, /await putState\(plan\.statePayload\);[\s\S]*?await loadStateForBrowser\(\{\s*showMessage:\s*false,\s*applyStructural:\s*true\s*\}\)/);
  assert.match(saveBody, /if\s*\(!serverAvailableForBrowser\)\s*\{\s*location\.reload\(\);\s*return;\s*\}/);
  assert.doesNotMatch(saveBody, /setTimeout\(\(\) => location\.reload\(\),\s*250\)/);
});


test('stock startup reuses the exact same admin module URL instead of loading a second copy', () => {
  const pageAdmin = html.match(/catalogue-admin-unified-v139\.mjs\?v=([^"']+)/)?.[1] || '';
  const stockAdmin = stock.match(/catalogue-admin-unified-v139\.mjs\?v=([^"']+)/)?.[1] || '';
  assert.ok(pageAdmin, 'page admin module version should be present');
  assert.equal(stockAdmin, pageAdmin, 'stock client must import the exact same module URL so the browser deduplicates it');
});

test('the above-the-fold header illustration is never lazy-loaded', () => {
  const headerImage = html.match(/<div class="header-illustration">\s*(<img\b[^>]*>)/i)?.[1] || '';
  assert.match(headerImage, /loading="eager"/i);
  assert.match(headerImage, /fetchpriority="high"/i);
  assert.doesNotMatch(headerImage, /loading="lazy"/i);
});

test('offscreen cards opt into browser rendering deferral without changing print output', () => {
  assert.match(html, /article\.card\{content-visibility:auto;contain-intrinsic-size:auto 1000px\}/);
  assert.match(html, /@media print\{article\.card\{content-visibility:visible!important;contain-intrinsic-size:none!important\}\}/);
});


test('identical laurel artwork is shared by URL instead of downloaded once per card', async () => {
  const crownImgs = [...html.matchAll(/<div class="gem-award crown-tier"[\s\S]*?<img\s+src="([^"]+)"/g)].map(match => match[1]);
  const gemImgs = [...html.matchAll(/<div class="gem-award gem-tier"[\s\S]*?<img\s+src="([^"]+)"/g)].map(match => match[1]);
  assert.ok(crownImgs.length >= 1);
  assert.ok(gemImgs.length >= 1);
  assert.deepEqual([...new Set(crownImgs)], ['/art/ui/crown-laurel-31ebc39213.webp']);
  assert.deepEqual([...new Set(gemImgs)], ['/art/ui/gem-laurel-846739ec52.webp']);

  const [sharedCrown, oldCrown, sharedGem, oldGem] = await Promise.all([
    readFile(new URL('../public/art/ui/crown-laurel-31ebc39213.webp', import.meta.url)),
    readFile(new URL('../public/art/aj-fernandez-new-world-oscuro-31ebc39213.webp', import.meta.url)),
    readFile(new URL('../public/art/ui/gem-laurel-846739ec52.webp', import.meta.url)),
    readFile(new URL('../public/art/liga-privada-no-9-coronets-846739ec52.webp', import.meta.url))
  ]);
  assert.deepEqual(sharedCrown, oldCrown, 'shared Crown art must remain byte-identical');
  assert.deepEqual(sharedGem, oldGem, 'shared Gem art must remain byte-identical');
});
