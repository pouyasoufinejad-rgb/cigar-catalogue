// The flavour axes and the masks their icons are drawn from. The colour is what ties an
// icon to its bar, so the thing most worth pinning is that the declared colour is still the
// artwork's own colour and that no mask has quietly lost its shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import sharp from 'sharp';

import {
  FLAVOUR_AXES,
  FLAVOUR_AXES_WITH_ART,
  FLAVOUR_AXIS_IDS,
  FLAVOUR_SCALE_MAX,
  flavourAxis,
  hasFlavourProfile,
  normaliseFlavourIntensity,
  normaliseFlavourProfile
} from '../public/catalogue-flavour-axes.mjs';
import { FLAVOUR_ART } from '../public/catalogue-flavour-art.mjs';
import { sampleColour } from '../scripts/build-flavour-icons.mjs';

const ART_DIR = new URL('../public/art/flavour/', import.meta.url);

test('the seven axes are declared once, in catalogue order, with distinct colours', () => {
  assert.deepEqual(FLAVOUR_AXIS_IDS, ['sweet', 'pepper', 'spice', 'earth', 'nuts', 'cedar', 'smoke']);
  const colours = FLAVOUR_AXES.map(axis => axis.colour.toLowerCase());
  assert.equal(new Set(colours).size, colours.length, 'no two axes share a colour');
  for (const axis of FLAVOUR_AXES) {
    assert.match(axis.colour, /^#[0-9a-f]{6}$/i, `${axis.id} has a full hex colour`);
    assert.ok(axis.label, `${axis.id} has a label`);
  }
});

test('an unprofiled axis is absent, not zero', () => {
  assert.equal(normaliseFlavourIntensity(undefined), null);
  assert.equal(normaliseFlavourIntensity(null), null);
  assert.equal(normaliseFlavourIntensity(''), null);
  assert.equal(normaliseFlavourIntensity('nonsense'), null);
  assert.equal(normaliseFlavourIntensity(0), 0, 'a measured zero is a real value');
});

test('intensities are clamped to the scale and rounded', () => {
  assert.equal(normaliseFlavourIntensity(99), FLAVOUR_SCALE_MAX);
  assert.equal(normaliseFlavourIntensity(-4), 0);
  assert.equal(normaliseFlavourIntensity('3'), 3);
  assert.equal(normaliseFlavourIntensity(2.6), 3);
});

test('a profile keeps only real values for named axes, in catalogue order', () => {
  const profile = normaliseFlavourProfile({ cedar: 4, sweet: 2, bogus: 5, smoke: null, earth: 0 });
  assert.deepEqual(Object.keys(profile), ['sweet', 'earth', 'cedar']);
  assert.deepEqual(profile, { sweet: 2, earth: 0, cedar: 4 });
  assert.equal(hasFlavourProfile({}), false);
  assert.equal(hasFlavourProfile({ bogus: 3 }), false);
  assert.equal(hasFlavourProfile({ earth: 0 }), true);
});

test('flavourAxis resolves by id and refuses anything else', () => {
  assert.equal(flavourAxis('CEDAR').label, 'Cedar');
  assert.equal(flavourAxis('bogus'), null);
  assert.equal(flavourAxis(''), null);
});

test('every built mask is named for a hash of its own contents', async () => {
  const files = await readdir(ART_DIR);
  for (const [id, path] of Object.entries(FLAVOUR_ART)) {
    const name = path.replace('/art/flavour/', '');
    assert.ok(files.includes(name), `${id} mask ${name} is on disk`);
    assert.match(name, new RegExp(`^${id}-[0-9a-f]{8}\\.png$`), `${name} carries a content hash`);
  }
  assert.equal(files.length, Object.keys(FLAVOUR_ART).length, 'no stale masks left behind');
});

test('each mask is pure alpha at a common size, so the page can tint it', async () => {
  for (const axis of FLAVOUR_AXES_WITH_ART) {
    const file = new URL(axis.mask.replace('/art/flavour/', ''), ART_DIR);
    const { data, info } = await sharp(await stat(file).then(() => file.pathname))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 128, `${axis.id} width`);
    assert.equal(info.height, 128, `${axis.id} height`);
    let ink = 0;
    let colouredPixels = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      if (data[i * 4 + 3] > 24) ink += 1;
      if (data[i * 4] || data[i * 4 + 1] || data[i * 4 + 2]) colouredPixels += 1;
    }
    assert.equal(colouredPixels, 0, `${axis.id} carries no colour of its own`);
    const coverage = ink / (info.width * info.height);
    assert.ok(coverage > 0.05, `${axis.id} still has a shape (${(coverage * 100).toFixed(1)}%)`);
    assert.ok(coverage < 0.75, `${axis.id} is line art, not a filled block`);
  }
});

// A colour edited here but not in the art, or art replaced without updating the colour,
// would show as an icon that does not match the bar beside it.
test('each declared colour is still the colour of its own artwork', async () => {
  const sources = {
    sweet: '15.png', spice: '14.png', earth: '13.png', nuts: '12.webp', cedar: '11.webp'
  };
  const dir = '/tmp/claude-0/-home-user-cigar-catalogue/8fe72223-0a57-5095-9c3a-e6853003096c/images/';
  for (const [id, file] of Object.entries(sources)) {
    const path = dir + file;
    const present = await stat(path).then(() => true).catch(() => false);
    if (!present) continue; // the originals are not part of the repo
    assert.equal(await sampleColour(path), flavourAxis(id).colour, `${id} colour matches its art`);
  }
});

test('axes still awaiting artwork are declared but excluded from the drawn set', () => {
  const drawn = new Set(FLAVOUR_AXES_WITH_ART.map(axis => axis.id));
  for (const axis of FLAVOUR_AXES) {
    assert.equal(drawn.has(axis.id), Boolean(axis.mask), `${axis.id} is drawn only if it has a mask`);
  }
});
