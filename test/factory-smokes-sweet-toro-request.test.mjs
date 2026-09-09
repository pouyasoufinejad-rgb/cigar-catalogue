import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requestUrl = new URL('../catalogue-requests/2026-09-09-drew-estate-factory-smokes-sweet-toro.json', import.meta.url);
let request = null;
try {
  request = JSON.parse(await readFile(requestUrl, 'utf8'));
} catch (_) {
  request = null;
}

test('Factory Smokes Sweet Toro is published as an explicit Half-Cigar entry', () => {
  assert.ok(request, 'Factory Smokes Sweet Toro catalogue request must exist');
  assert.equal(request.operation, 'upsert-entry');
  assert.equal(request.key, 'drew-estate-factory-smokes-sweet-toro');
  assert.equal(request.entry.catalogueType, 'half');
  assert.equal(request.entry.taster, false);
  assert.equal(request.entry.length, 6);
  assert.equal(request.entry.ring, 54);
  assert.equal(request.entry.packagePrice, 53);
  assert.equal(request.entry.price, 26.5);
});

test('Factory Smokes Sweet Toro prose and note do not contain redundant untasted wording', () => {
  assert.ok(request, 'Factory Smokes Sweet Toro catalogue request must exist');
  const prose = `${request.entry.summaryHtml || ''} ${request.entry.noteHtml || ''}`;
  assert.doesNotMatch(prose, /untasted/i);
  assert.equal(request.entry.noteHtml, '');
});

test('Factory Smokes Sweet Toro mirrors Half-Cigar production and practical structure', () => {
  assert.ok(request, 'Factory Smokes Sweet Toro catalogue request must exist');
  assert.deepEqual(request.entry.productionLines, [
    'Handmade in Nicaragua',
    'Wrapper: sweet-capped Habano',
    'Binder: Indonesian',
    'Filler: Central American'
  ]);
  assert.deepEqual(request.entry.practicalLines, [
    'Single cigar',
    'Pre-cut before lighting',
    'Two 3″ × 54 sessions',
    'Sweetened cap retained only on the head half',
    '54 RG; slow cadence recommended'
  ]);
});
