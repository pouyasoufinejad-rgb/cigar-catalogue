import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const REQUEST_DIR = new URL('../catalogue-requests/', import.meta.url);
const PREFIX = '2026-09-27-coffee-profile-';

async function requestFor(key) {
  return JSON.parse(await readFile(new URL(`${PREFIX}${key}.json`, REQUEST_DIR), 'utf8'));
}

function coffeeValues(entry = {}) {
  const values = [];
  if (entry.flavourProfile && Object.prototype.hasOwnProperty.call(entry.flavourProfile, 'coffee')) {
    values.push(entry.flavourProfile.coffee);
  }
  for (const blend of Array.isArray(entry.blendVariants) ? entry.blendVariants : []) {
    if (blend?.flavourProfile && Object.prototype.hasOwnProperty.call(blend.flavourProfile, 'coffee')) {
      values.push(blend.flavourProfile.coffee);
    }
  }
  return values;
}

test('Coffee is selectively seeded across every catalogue record whose existing copy calls it out', async () => {
  const files = (await readdir(REQUEST_DIR)).filter(name => name.startsWith(PREFIX) && name.endsWith('.json'));
  assert.equal(files.length, 67);
  for (const file of files) {
    const doc = JSON.parse(await readFile(new URL(file, REQUEST_DIR), 'utf8'));
    assert.equal(doc.operation, 'upsert-entry', file);
    const values = coffeeValues(doc.entry);
    assert.ok(values.length >= 1, `${file} carries Coffee on its parent or relevant blend`);
    for (const value of values) {
      assert.ok(Number.isInteger(value) && value >= 1 && value <= 5, `${file} Coffee intensity is 1–5`);
    }
  }
});

test('dominant coffee-infused entries use the top intensity', async () => {
  assert.equal((await requestFor('java-x-press-maduro')).entry.flavourProfile.coffee, 5);
  assert.equal((await requestFor('tabak-especial-cafecita-negra')).entry.flavourProfile.coffee, 5);
  assert.equal((await requestFor('tabak-especial-colada-oscuro')).entry.flavourProfile.coffee, 5);
  assert.equal((await requestFor('isla-del-sol-maduro-coronets')).entry.flavourProfile.coffee, 5);
});

test('clear secondary or background coffee notes are not exaggerated', async () => {
  assert.equal((await requestFor('arturo-fuente-hemingway-classic-natural')).entry.flavourProfile.coffee, 2);
  assert.equal((await requestFor('montecristo-joyitas')).entry.flavourProfile.coffee, 2);
  assert.equal((await requestFor('paradiso-elegancia-corona')).entry.flavourProfile.coffee, 2);
  assert.equal((await requestFor('romeo-y-julieta-petit-royales')).entry.flavourProfile.coffee, 2);
});

test('Nasty Fritas keeps the user-adjusted Pepper 1 while gaining Coffee', async () => {
  const profile = (await requestFor('liga-privada-unico-nasty-fritas')).entry.flavourProfile;
  assert.deepEqual(profile, { sweet:3, pepper:1, earth:4, coffee:4 });
});

test('blend-specific Coffee stays on the blend that actually has the note', async () => {
  const cubanitos = await requestFor('arturo-fuente-cubanitos-10');
  assert.equal(cubanitos.entry.flavourProfile, undefined);
  assert.equal(cubanitos.entry.blendVariants.find(item => item.id === 'maduro').flavourProfile.coffee, 4);

  const wiseMan = await requestFor('foundation-wise-man-corojo-corona');
  assert.equal(wiseMan.entry.flavourProfile, undefined);
  assert.equal(wiseMan.entry.blendVariants.find(item => item.id === 'maduro').flavourProfile.coffee, 4);

  const exquisitos = await requestFor('arturo-fuente-exquisitos-maduro');
  assert.equal(exquisitos.entry.flavourProfile.coffee, 4);
  assert.equal(exquisitos.entry.blendVariants.find(item => item.id === 'natural').flavourProfile.coffee, 3);

  const rocky = await requestFor('rocky-patel-sun-grown-juniors');
  assert.equal(rocky.entry.flavourProfile.coffee, 3);
  assert.equal(rocky.entry.blendVariants.find(item => item.id === 'maduro').flavourProfile.coffee, 4);
});
