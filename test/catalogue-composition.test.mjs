import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validateRequest } from '../scripts/publish-catalogue-request.mjs';

const ACTIVE_KEYS = [
  'liga-privada-no-9-coronets',
  'liga-t52-coronets',
  'undercrown-maduro-coronets',
  'aj-fernandez-new-world-oscuro',
  'don-pepin-garcia-demi-tasse',
  'rocky-patel-sun-grown-juniors',
  'tabernacle-broadleaf-corona',
  'oliva-serie-o',
  'oliva-serie-v-club-20',
  'arturo-fuente-exquisitos-maduro',
  'kfc-ponies',
  'ashton-aged-maduro-esquire',
  'oliva-serie-g-maduro-special-g',
  'davidoff-escurio',
  'kfc-ponies-sweets',
  'davidoff-nicaragua-mini-cigarillos',
  'partagas-serie-club-10',
  'cohiba-short-10',
  'alonso-menendez-gold-cigarillo',
  'alonso-menendez-axe-charutos',
  'isla-del-sol-maduro-coronets',
  'java-x-press-maduro',
  'tabak-especial-cafecita-negra',
  'cao-bella-vanilla',
  'toscanello-nero-cioccolato',
  'cao-moontrance',
  'liga-privada-t52-short-panatela',
  'oliva-serie-v-melanio-no4',
  'davidoff-escurio-petit-robusto',
  'cohiba-short-single',
  'isla-del-sol-maduro-gran-corona',
  'tabak-especial-colada-oscuro',
  'cao-bella-vanilla-petit-corona',
  'cao-moontrance-tubos',
  'tatiana-dolce-vanilla',
  'tatiana-mini-vanilla',
  'curivari-fuerte-churchill-single',
  'davidoff-primeros-escurio',
  'toscano-antico-half',
  'rocky-patel-disciple-half-corona'
];

test('every active entry has an auditable wrapper, binder and filler update', async () => {
  const requestDirectory = join(import.meta.dirname, '..', 'catalogue-requests');
  const names = (await readdir(requestDirectory))
    .filter(name => /^2026-08-31-composition-.*\.json$/.test(name))
    .sort();
  const requests = await Promise.all(names.map(async name => {
    const document = JSON.parse(await readFile(join(requestDirectory, name), 'utf8'));
    return validateRequest(document);
  }));

  const requestKeys = requests.map(request => request.key);
  assert.equal(new Set(requestKeys).size, requestKeys.length, 'composition requests must not contain duplicate keys');
  assert.deepEqual(
    ACTIVE_KEYS.filter(key => !requestKeys.includes(key)),
    [],
    'composition requests must cover every currently active entry'
  );

  for (const request of requests) {
    assert.equal(request.operation, 'upsert-entry');
    assert.equal(request.entry.productionLines.length, 5, `${request.key} must have five Production lines`);
    assert.match(request.entry.productionLines[2], /^Wrapper: \S/);
    assert.match(request.entry.productionLines[3], /^Binder: \S/);
    assert.match(request.entry.productionLines[4], /^Filler: \S/);
  }
});
