import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const presentationSource = await readFile(new URL('../public/catalogue-presentation.mjs', import.meta.url), 'utf8');
const cohortSource = await readFile(new URL('../public/catalogue-half-cohort.mjs', import.meta.url), 'utf8').catch(() => '');

test('recommendation presentation no longer owns Half-Cigar membership or text detection', () => {
  assert.doesNotMatch(presentationSource, /containsHalfCigarCue/);
  assert.doesNotMatch(presentationSource, /isHalfCigarCard/);
  assert.doesNotMatch(presentationSource, /data-noteworthy-section=["']substantial["']/);
  assert.doesNotMatch(presentationSource, /data-half-cigar-filter/);
});

test('Half-Cigar cohort owns a separate section and explicit catalogue-type membership', () => {
  assert.match(cohortSource, /half-cigar-section/);
  assert.match(cohortSource, /half-cigar-cards/);
  assert.match(cohortSource, /catalogueType/);
  assert.match(cohortSource, /data-catalogue-type/);
  assert.match(cohortSource, /Half-Cigar/);
  assert.match(cohortSource, /H\$\{/);
});

test('Half-Cigar cohort extends the existing Catalogue type control rather than creating a second editor', () => {
  assert.match(cohortSource, /catalogue-v139-type/);
  assert.match(cohortSource, /option/);
  assert.match(cohortSource, /value\s*=\s*['"]half['"]/);
  assert.doesNotMatch(cohortSource, /catalogue-admin-secondary/);
});
