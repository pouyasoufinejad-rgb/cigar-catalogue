import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');

test('runtime cuts over to the rebuilt catalogue surface', () => {
  assert.match(runtime, /catalogue-next-ui\.mjs\?v=20260915-next1/);
});

test('runtime retires browser modules that own competing catalogue editors and layouts', () => {
  for (const retired of [
    'catalogue-convenience.mjs',
    'catalogue-recommendation-subsections.mjs',
    'catalogue-structure-editor.mjs',
    'catalogue-editor-behaviour.mjs',
    'catalogue-editor-fullscreen.mjs',
    'catalogue-direct-persistence.mjs',
    'catalogue-flavour.mjs',
    'catalogue-card-layout.mjs',
    'catalogue-size-presentation.mjs',
    'catalogue-presentation.mjs',
    'catalogue-convenience-refinements.mjs'
  ]) assert.doesNotMatch(runtime, new RegExp(retired.replaceAll('.', '\\.') ));
});

test('personal status hydration remains available before the rebuilt UI installs', () => {
  const personal = runtime.indexOf('catalogue-personal-status-persistence.mjs');
  const next = runtime.indexOf('catalogue-next-ui.mjs');
  assert.ok(personal >= 0 && next > personal);
  assert.match(runtime, /await import\('\.\/catalogue-personal-status-persistence\.mjs'/);
});
