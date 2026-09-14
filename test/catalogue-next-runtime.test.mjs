import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../public/catalogue-runtime.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/deploy-worker.yml', import.meta.url), 'utf8');
const liveVerifier = await readFile(new URL('../scripts/verify-live-next-ui.mjs', import.meta.url), 'utf8');
const executableRuntime = runtime
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('runtime cuts over to the rebuilt catalogue surface', () => {
  assert.match(executableRuntime, /catalogue-next-ui\.mjs\?v=20260915-next1/);
});

test('runtime does not execute browser modules that own competing catalogue editors and layouts', () => {
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
  ]) assert.doesNotMatch(executableRuntime, new RegExp(retired.replaceAll('.', '\\.')));
});

test('personal status hydration remains available before the rebuilt UI installs', () => {
  const personal = executableRuntime.indexOf('catalogue-personal-status-persistence.mjs');
  const next = executableRuntime.indexOf('catalogue-next-ui.mjs');
  assert.ok(personal >= 0 && next > personal);
  assert.match(executableRuntime, /await import\('\.\/catalogue-personal-status-persistence\.mjs'/);
});

test('production deployment verifies the rebuilt UI without the obsolete runtime contract', () => {
  assert.match(workflow, /node scripts\/verify-live-next-ui\.mjs/);
  assert.doesNotMatch(workflow, /node scripts\/verify-live-code-ready\.mjs/);
});

test('production live verifier guards the retained Jax and the Skeletons artwork', () => {
  assert.match(liveVerifier, /Jax smoking a cigar with laughing skeletons behind him/);
  assert.match(liveVerifier, /header-illustration/);
});
