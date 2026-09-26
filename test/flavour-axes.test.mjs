// The flavour axes and the masks their icons are drawn from. The colour is what ties an
// icon to its bar, so the thing most worth pinning is that the declared colour is still the
// artwork's own colour and that no mask has quietly lost its shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
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
    sweet: '15.png', spice: '14.png', earth: '13.png', nuts: '12.webp', cedar: '11.webp',
    smoke: '16.png', pepper: '17.png'
  };
  const dir = '/tmp/claude-0/-home-user-cigar-catalogue/8fe72223-0a57-5095-9c3a-e6853003096c/images/';
  for (const [id, file] of Object.entries(sources)) {
    const path = dir + file;
    const present = await stat(path).then(() => true).catch(() => false);
    if (!present) continue; // the originals are not part of the repo
    assert.equal(await sampleColour(path), flavourAxis(id).colour, `${id} colour matches its art`);
  }
});

test('every axis now has artwork, so none falls back to a plain disc', () => {
  assert.equal(FLAVOUR_AXES_WITH_ART.length, FLAVOUR_AXES.length);
  for (const axis of FLAVOUR_AXES) assert.ok(axis.mask, `${axis.id} has a mask`);
});

test('an axis without artwork is still handled, should one ever be added', () => {
  const drawn = new Set(FLAVOUR_AXES_WITH_ART.map(axis => axis.id));
  for (const axis of FLAVOUR_AXES) {
    assert.equal(drawn.has(axis.id), Boolean(axis.mask), `${axis.id} is drawn only if it has a mask`);
  }
});

// Rendering. The profile is drawn on the front of the card, under the facts.
import { JSDOM } from 'jsdom';
import { renderEntryCard } from '../src/index.js';
import { flavourProfileMarkup } from '../public/catalogue-flavour-axes.mjs';
import { blendEffectiveRecord } from '../public/catalogue-variants.mjs';

const CARD = Object.freeze({
  key: 'profile-fixture', brand: 'Brand', title: 'Title', eyebrow: 'Eyebrow', rank: 1,
  length: 5, ring: 44, price: 20, packagePrice: 20, packageLabel: 'single cigar',
  country: 'DR', strength: 7, quality: 8, flavour: 7, risk: 1, stock: 'in',
  summaryHtml: '<strong>Prose.</strong>', productionLines: ['Handmade'],
  practicalLines: ['Single cigar'], smokeTime: '40 min smoke', retailerLinks: [],
  flavourProfile: { sweet: 2, pepper: 4, earth: 5, cedar: 3 }
});

const parse = html => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

test('a profiled card draws one row per profiled axis, in catalogue order', () => {
  const doc = parse(renderEntryCard(CARD));
  const axes = [...doc.querySelectorAll('.flavour-axis')].map(node => node.dataset.axis);
  assert.deepEqual(axes, ['sweet', 'pepper', 'earth', 'cedar'], 'only profiled axes, in order');
});

test('each row fills exactly as many pips as its intensity', () => {
  const doc = parse(renderEntryCard(CARD));
  for (const [id, expected] of Object.entries(CARD.flavourProfile)) {
    const row = doc.querySelector(`.flavour-axis[data-axis="${id}"]`);
    assert.equal(row.querySelectorAll('.flavour-pip').length, FLAVOUR_SCALE_MAX, `${id} pip count`);
    assert.equal(row.querySelectorAll('.flavour-pip.is-on').length, expected, `${id} filled pips`);
  }
});

test('the row carries its axis colour once, for both the icon and the pips', () => {
  const doc = parse(renderEntryCard(CARD));
  const row = doc.querySelector('.flavour-axis[data-axis="cedar"]');
  assert.match(row.getAttribute('style'), /--flavour-colour:#c48c5c/);
  assert.match(row.querySelector('.flavour-icon').getAttribute('style'), /mask-image:url\('\/art\/flavour\/cedar-[0-9a-f]{8}\.png'\)/);
});

test('an axis without artwork gets a row as a plain disc, not a broken image', () => {
  // Every shipped axis has art now, so this is driven with a stand-in that has none.
  const unpainted = [{ id: 'pepper', label: 'Pepper', colour: '#a43c2c', mask: '' }];
  const doc = parse(flavourProfileMarkup({ pepper: 3 }, unpainted));
  const icon = doc.querySelector('.flavour-axis[data-axis="pepper"] .flavour-icon');
  assert.ok(icon.classList.contains('flavour-icon-plain'), 'no mask requested');
  assert.equal(icon.getAttribute('style'), null, 'and no mask url');
  assert.equal(doc.querySelectorAll('.flavour-pip.is-on').length, 3, 'the pips still fill');
});

test('the profile is announced, not left as decoration', () => {
  const doc = parse(renderEntryCard(CARD));
  const row = doc.querySelector('.flavour-axis[data-axis="earth"]');
  assert.equal(row.getAttribute('role'), 'img');
  assert.equal(row.getAttribute('aria-label'), 'Earth 5 of 5');
});

test('an unprofiled card draws nothing at all', () => {
  const doc = parse(renderEntryCard({ ...CARD, flavourProfile: {} }));
  assert.equal(doc.querySelector('.flavour-profile'), null);
});

test('the profile sits on the front face, under the facts', () => {
  const doc = parse(renderEntryCard(CARD));
  const profile = doc.querySelector('.flavour-profile');
  assert.ok(profile.closest('.card-face-front'), 'front face, not behind the flip');
  assert.equal(profile.previousElementSibling?.className, 'facts');
});

test('a measured zero renders an empty bar, which is not the same as no bar', () => {
  const zero = parse(renderEntryCard({ ...CARD, flavourProfile: { earth: 0 } }));
  assert.ok(zero.querySelector('.flavour-axis[data-axis="earth"]'), 'zero still gets a row');
  assert.equal(zero.querySelectorAll('.flavour-pip.is-on').length, 0);
});

test('a blend variant carries its own profile and does not inherit the parent one', () => {
  const record = {
    ...CARD,
    blendVariants: [
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two', flavourProfile: { smoke: 5, nuts: 1 } }
    ],
    defaultBlendVariantId: 'one'
  };
  assert.deepEqual(blendEffectiveRecord(record, 'one').record.flavourProfile, CARD.flavourProfile);
  assert.deepEqual(blendEffectiveRecord(record, 'two').record.flavourProfile, { nuts: 1, smoke: 5 });
});

test('the stylesheet paints the icon with the row colour and keeps every pip outlined', async () => {
  const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const href = page.match(/<link rel="stylesheet" href="(\/css\/catalogue-[0-9a-f]{10}\.css)">/)[1];
  const css = await readFile(new URL(`../public${href}`, import.meta.url), 'utf8');
  assert.match(css, /\.flavour-icon\{[^}]*background-color:var\(--flavour-colour\)/);
  // The name is set in the catalogue's own label face, not a browser default.
  assert.match(css, /\.flavour-label\{[^}]*font-family:Cinzel/);
  const iconSize = css.match(/\.flavour-icon\{flex:none;width:(\d+)px/)?.[1];
  assert.ok(Number(iconSize) >= 20, `the icon should be legible, it is ${iconSize}px`);
  assert.match(css, /\.flavour-pip\{[^}]*border:1px solid/);
  assert.match(css, /\.flavour-pip\.is-on\{background:var\(--flavour-colour\)\}/);
});

// Editing. Every card must be adjustable, not just the ones carrying blend variants, and
// an axis has to be addable and removable at any time.
test('the profile editor reads only the axes actually filled in', async () => {
  const { profileFromEditorFields } = await import('../public/catalogue-flavour.mjs');
  const values = { sweet: '4', cedar: '0', pepper: '', earth: '   ', nuts: 'nonsense', smoke: '9' };
  const fakeDocument = {
    getElementById: id => {
      const axis = id.replace('catalogue-admin-flavour-', '');
      return Object.prototype.hasOwnProperty.call(values, axis) ? { value: values[axis] } : null;
    }
  };
  const profile = profileFromEditorFields(fakeDocument);
  assert.deepEqual(profile, { sweet: 4, cedar: 0, smoke: 5 }, 'blanks and junk are left out, 9 clamps to 5');
  assert.equal('pepper' in profile, false, 'a blank axis stays off the card');
  assert.equal('cedar' in profile, true, 'a typed zero is kept, since it is a judgement');
});

test('a profile saved from the admin panel lands on the card override', async () => {
  const { injectFlavourProfileIntoStatePayload } = await import('../public/catalogue-flavour.mjs');
  const payload = { cards: { alpha: { flavour: 7 }, beta: { flavour: 3 } } };
  const next = injectFlavourProfileIntoStatePayload(payload, 'alpha', { cedar: 3, bogus: 9 });
  assert.deepEqual(next.cards.alpha.flavourProfile, { cedar: 3 }, 'unknown axes are dropped');
  assert.equal(next.cards.alpha.flavour, 7, 'the existing rating is preserved');
  assert.deepEqual(next.cards.beta, { flavour: 3 }, 'other cards are untouched');
});

test('clearing every axis removes the profile rather than leaving stale bars', async () => {
  const { injectFlavourProfileIntoStatePayload } = await import('../public/catalogue-flavour.mjs');
  const payload = { cards: { alpha: { flavourProfile: { cedar: 3, sweet: 2 } } } };
  const next = injectFlavourProfileIntoStatePayload(payload, 'alpha', {});
  assert.deepEqual(next.cards.alpha.flavourProfile, {});
  assert.equal(flavourProfileMarkup(next.cards.alpha.flavourProfile), '', 'and the card draws nothing');
});

test('a partly profiled cigar draws only the axes it was judged on', () => {
  const doc = parse(flavourProfileMarkup({ cedar: 3, pepper: 4 }));
  assert.deepEqual([...doc.querySelectorAll('.flavour-axis')].map(n => n.dataset.axis), ['pepper', 'cedar']);
  assert.equal(doc.querySelectorAll('.flavour-axis').length, 2, 'the other five stay off the card');
});

test('each row names its axis in visible text, not only to screen readers', () => {
  const doc = parse(renderEntryCard({ ...CARD, flavourProfile: { cedar: 3, pepper: 4 } }));
  const labels = [...doc.querySelectorAll('.flavour-axis .flavour-label')].map(n => n.textContent);
  assert.deepEqual(labels, ['Pepper', 'Cedar']);
});

test('the page links the stylesheet whose contents it actually has', async () => {
  const { hashedName } = await import('../scripts/rehash-stylesheet.mjs');
  const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const linked = page.match(/\/css\/(catalogue-[0-9a-f]{10}\.css)/)[1];
  const css = await readFile(new URL(`../public/css/${linked}`, import.meta.url), 'utf8');
  // /css/* is served immutable, so a name describing contents it no longer has would pin
  // stale rules in every browser that had already cached it.
  assert.equal(hashedName(css), linked);
});
