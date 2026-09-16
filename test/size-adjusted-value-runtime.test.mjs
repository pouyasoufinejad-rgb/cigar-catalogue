import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../public/catalogue-size-value-runtime.mjs', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

test('catalogue runtime loads the size-adjusted Value layer', () => {
  assert.match(bootstrap, /catalogue-size-value-runtime\.mjs/);
});

test('size-adjusted runtime derives Value from dimensions and catalogue type', () => {
  assert.match(runtime, /length:\s*input\.length/);
  assert.match(runtime, /ring:\s*input\.ring/);
  assert.match(runtime, /catalogueType:\s*input\.catalogueType/);
  assert.match(runtime, /valueUnit:\s*input\.valueUnit/);
  assert.match(runtime, /valueSizeFactor/);
  assert.match(runtime, /valueSessionPrice/);
});

test('size-adjusted runtime follows catalogue state writes and editor dimension changes', () => {
  assert.match(runtime, /registerCatalogueStateResponseListener\('size-value',\s*event\s*=>/);
  assert.match(runtime, /catalogue-v139-length/);
  assert.match(runtime, /catalogue-v139-ring/);
  assert.match(runtime, /catalogue-v139-type/);
});
