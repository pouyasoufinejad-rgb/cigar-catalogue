import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleUrl = new URL('../public/catalogue-convenience.mjs', import.meta.url);

test('active personal statuses are visually explicit rather than looking disabled', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  assert.match(source, /\.catalogue-personal-controls button\[aria-pressed="true"\]/);
  assert.match(source, /background\s*:\s*#d9bc70/i);
  assert.match(source, /color\s*:\s*#18120a/i);
  assert.match(source, /button\.textContent\s*=\s*active\s*\?\s*`✓ \$\{PERSONAL_LABELS\[name\]\}`\s*:\s*PERSONAL_LABELS\[name\]/);
});

test('compare dialog is compact enough for four cigars and uses smaller product imagery', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  assert.match(source, /\.catalogue-compare-dialog\{[^}]*width:min\(94vw,820px\)/s);
  assert.match(source, /grid-template-columns:96px repeat\(var\(--compare-count\),minmax\(145px,1fr\)\)/);
  assert.match(source, /\.catalogue-compare-product img\{width:48px;height:60px/);
});

test('compare view keeps crucial rows primary and moves secondary rows behind More', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  for (const field of ['Price / stick', 'Dimensions', 'Strength', 'Quality', 'Flavour', 'Value', 'Smoke time', 'Stock']) {
    assert.ok(source.includes(field), `primary compare should include ${field}`);
  }
  assert.match(source, /data-compare-more/);
  assert.match(source, /More details/);
  assert.match(source, /catalogue-compare-secondary/);
  for (const field of ['Package', 'Personal status', 'Production']) {
    assert.ok(source.includes(field), `secondary compare should include ${field}`);
  }
});
