import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const admin = await readFile(new URL('../public/catalogue-admin-unified-v139.mjs', import.meta.url), 'utf8');

test('initial catalogue boot trusts Worker-rendered structural fields instead of rewriting every card', () => {
  assert.match(admin, /async function loadStateForBrowser\(\{\s*showMessage\s*=\s*false,\s*applyStructural\s*=\s*true\s*\}\s*=\s*\{\}\)/);
  assert.match(admin, /if\s*\(applyStructural\)\s*applyStructuralOverrideToCard\(card,\s*effectiveStructure\(card,\s*stateForBrowser\)\)/);
  assert.match(admin, /loadStateForBrowser\(\{\s*applyStructural:\s*false\s*\}\)/);
});

test('manual editor reload can still reapply structural fields without a full navigation', () => {
  assert.match(admin, /reloadEditorState\(\)[\s\S]*?loadStateForBrowser\(\{\s*showMessage:\s*true,\s*applyStructural:\s*true\s*\}\)/);
});
