import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('compact catalogue utility icons sit above ranked recommendations', () => {
  const strip = html.indexOf('class="catalogue-utility-strip"');
  const heading = html.indexOf('<h2>Ranked recommendations</h2>');
  assert.ok(strip >= 0 && strip < heading);
  assert.match(html, /aria-label="Legend &amp; scoring guide"/);
  assert.match(html, /aria-label="Benchmarks"/);
  assert.match(html, /aria-label="Live stock checks"/);
  assert.equal((html.match(/name="catalogue-utility"/g) || []).length, 3);
});

test('utility conversion preserves stock hooks and hashed stylesheet', async () => {
  assert.match(html, /id="live-stock-check"/);
  assert.match(html, /id="live-stock-now"/);
  assert.match(html, /id="live-stock-full"/);
  const stylesheet = html.match(/href="\/css\/(catalogue-[0-9a-f]{10}\.css)"/)?.[1];
  assert.ok(stylesheet);
  const css = await readFile(new URL('../public/css/' + stylesheet, import.meta.url), 'utf8');
  assert.match(css, /\.catalogue-utility-strip\{/);
  assert.match(css, /\.catalogue-utility>summary\{/);
});
