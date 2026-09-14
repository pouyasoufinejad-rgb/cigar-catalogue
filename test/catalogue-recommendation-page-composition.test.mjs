import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rendererSource = await readFile(new URL('../public/catalogue-recommendation-subsections.mjs', import.meta.url), 'utf8');
const convenienceSource = await readFile(new URL('../public/catalogue-convenience.mjs', import.meta.url), 'utf8');
const runtimeSource = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../src/index-core.js', import.meta.url), 'utf8');

test('Recommendation subsections mount inside the existing Ranked Recommendations section before its legacy card stack', () => {
  assert.match(rendererSource, /querySelector\?\.\('#cards'\)|querySelector\('#cards'\)/);
  assert.match(rendererSource, /insertBefore\(mount,\s*tierStack\)/);
  assert.doesNotMatch(rendererSource, /firstSection\.parentElement\.insertBefore\(mount,\s*firstSection\)/);
});

test('Recommendation subsection headings use dedicated subsection markup and spacing instead of top-level section headings', () => {
  assert.match(rendererSource, /recommendation-subsection-head/);
  assert.match(rendererSource, /recommendation-subsection\s*\{[^}]*margin-top:/s);
  assert.doesNotMatch(rendererSource, /head\.className\s*=\s*['"]section-head['"]/);
});

test('Recommendation renderer does not observe and rerender on every body child mutation', () => {
  assert.doesNotMatch(rendererSource, /observer\.observe\(document\.body,\s*\{\s*subtree:\s*true,\s*childList:\s*true\s*\}\)/s);
  assert.doesNotMatch(rendererSource, /new MutationObserver\(scheduleRefresh\)/);
});

test('Recommendation renderer refreshes explicitly after legacy sort and filter controls run', () => {
  assert.match(rendererSource, /getElementById\?\.\(['"]sort['"]\)|getElementById\(['"]sort['"]\)/);
  assert.match(rendererSource, /querySelectorAll\?\.\(['"]\.toggle button['"]\)|querySelectorAll\(['"]\.toggle button['"]\)/);
});

test('convenience navigation anchors before Recommendation subsections regardless of module load order', () => {
  assert.match(convenienceSource, /data-recommendation-subsections-root/);
  assert.match(convenienceSource, /recommendationRoot\s*\|\|\s*cards/);
});

test('the production bootstrap and changed Recommendation and convenience module URLs are versioned together for the composition fix', () => {
  assert.match(workerSource, /catalogue-runtime\.mjs\?v=20260914-v5/);
  assert.match(runtimeSource, /catalogue-recommendation-subsections\.mjs\?v=20260914-v5/);
  assert.match(runtimeSource, /catalogue-convenience\.mjs\?v=20260914-v5/);
});
