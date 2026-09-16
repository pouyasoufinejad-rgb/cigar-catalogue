import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStructureFamily,
  normaliseProductionLines,
  normalisePracticalLines,
  buildStructurePatch,
  findNonCompliantKeys
} from '../scripts/normalise-live-card-structure.mjs';

const context = {
  subsectionByKey: new Map([
    ['liga-no9', 'coronets-cigarillos'],
    ['regular', 'petit-panatelas'],
    ['flavoured-main', 'flavoured-infused']
  ])
};

test('classifies the four approved structure families from live catalogue role and subsection', () => {
  assert.equal(classifyStructureFamily({ key:'liga-no9', catalogueType:'main', ring:32 }, context), 'coronet-flavoured');
  assert.equal(classifyStructureFamily({ key:'flavoured-main', catalogueType:'main', ring:44 }, context), 'coronet-flavoured');
  assert.equal(classifyStructureFamily({ key:'regular', catalogueType:'main', ring:43 }, context), 'regular-main');
  assert.equal(classifyStructureFamily({ key:'t', catalogueType:'taster', taster:true }, context), 'taster');
  assert.equal(classifyStructureFamily({ key:'h', catalogueType:'half' }, context), 'half');
});

test('coronet/flavoured Production follows status, construction, wrapper, binder, filler and strips country wording', () => {
  const record = {
    key:'liga-no9',
    productionLines:[
      'Unflavoured',
      'Handmade in Nicaragua',
      'Wrapper: Connecticut River Valley Broadleaf Oscuro',
      'Binder: Brazilian Mata Fina',
      'Filler: Nicaraguan and Honduran'
    ]
  };
  assert.deepEqual(normaliseProductionLines(record, context), [
    'Unflavoured',
    'Handmade',
    'Wrapper: Connecticut River Valley Broadleaf Oscuro',
    'Binder: Brazilian Mata Fina',
    'Filler: Nicaraguan and Honduran'
  ]);
});

test('regular-main Production omits flavour status and country', () => {
  const record = {
    key:'regular',
    productionLines:[
      'Unflavoured',
      'Handmade in Nicaragua',
      'Wrapper: Mexican San Andrés',
      'Binder: Connecticut Broadleaf',
      'Filler: Nicaraguan long-filler'
    ]
  };
  assert.deepEqual(normaliseProductionLines(record, context), [
    'Handmade',
    'Wrapper: Mexican San Andrés',
    'Binder: Connecticut Broadleaf',
    'Filler: Nicaraguan long-filler'
  ]);
});

test('taster Production keeps flavoured/unflavoured but Practical collapses to the Isla del Sol four-line structure', () => {
  const record = {
    key:'t',
    catalogueType:'taster',
    taster:true,
    title:'Isla del Sol Maduro Gran Corona — Single',
    packageLabel:'single cigar',
    productionLines:['Flavoured','Handmade in Nicaragua','Wrapper: Mexican San Andrés maduro','Binder: Indonesian','Filler: Indonesian and Nicaraguan'],
    practicalLines:['Single cigar','5″ × 44 Gran Corona','A$37.39 single','Uncut','Protected','Long-filler construction','Forgiving Cadence']
  };
  assert.deepEqual(normaliseProductionLines(record, context), [
    'Flavoured','Handmade','Wrapper: Mexican San Andrés maduro','Binder: Indonesian','Filler: Indonesian and Nicaraguan'
  ]);
  assert.deepEqual(normalisePracticalLines(record, context), [
    'Single cigar','Uncut','Protected','Forgiving Cadence'
  ]);
});

test('regular-main Practical uses package, cut, protection, form/construction, useful role, cadence in that order', () => {
  const record = {
    key:'regular',
    title:'Undercrown 10 Corona Viva — Single',
    packageLabel:'single cigar',
    length:5,
    ring:43,
    productionLines:['Handmade','Wrapper: Mexican San Andrés','Binder: Connecticut Broadleaf','Filler: Nicaraguan long-filler'],
    practicalLines:['Single cigar','5″ × 43 Corona Viva','A$39 single','Long-filler construction','Direct Undercrown 10 blend taster','Slow cadence recommended']
  };
  assert.deepEqual(normalisePracticalLines(record, context), [
    'Single cigar',
    'Uncut',
    'Fragile',
    'Long-filler construction',
    'Direct Undercrown 10 blend taster',
    'Slow cadence recommended'
  ]);
});

test('half Production parses legacy prose and Practical becomes Two Halves first with full/session form details', () => {
  const record = {
    key:'h',
    catalogueType:'half',
    title:'The Wise Man Maduro Lancero',
    packageLabel:'single full lancero',
    length:3.5,
    ring:40,
    productionLines:[
      'Made in Nicaragua at My Father Cigars: Connecticut Broadleaf wrapper, Mexican San Andrés binder, and Nicaraguan filler tobaccos grown by the García family.',
      'Full-size vitola: 7″ × 40.',
      'Purchased as a full lancero and split before lighting into two ~3½″ × 40 half-sessions.'
    ],
    practicalLines:[
      'Buy the full Wise Man Maduro Lancero at Cigar Hut for ~A$49 each.',
      'Cut it cleanly in half before lighting: ~A$24.50 per ~3½″ × 40 session.',
      'This keeps the current full-bodied Broadleaf blend inside the catalogue’s practical-session target while preserving the concentrated lancero format.'
    ]
  };
  assert.deepEqual(normaliseProductionLines(record, context), [
    'Handmade',
    'Wrapper: Connecticut Broadleaf',
    'Binder: Mexican San Andrés',
    'Filler: Nicaraguan'
  ]);
  assert.deepEqual(normalisePracticalLines(record, context), [
    'Two Halves',
    'Cut',
    'Fragile',
    'Full cigar: 7″ × 40 Lancero',
    'Two 3½″ × 40 sessions',
    'Slow Cadence'
  ]);
});

test('coronet/flavoured Practical preserves package taxonomy and ends with cadence', () => {
  const record = {
    key:'liga-no9',
    packageLabel:'tin of 10',
    practicalLines:['Tin of 10','Uncut','Protected','Lenient Cadence']
  };
  assert.deepEqual(normalisePracticalLines(record, context), ['Tin of 10','Uncut','Protected','Lenient Cadence']);
});

test('buildStructurePatch is minimal and never alters rank or ratings', () => {
  const entry = {
    key:'regular', rank:7, strength:8, quality:9,
    productionLines:['Handmade in Nicaragua','Wrapper: A','Binder: B','Filler: C'],
    practicalLines:['Single cigar','5″ × 43 Corona','Slow Cadence']
  };
  const patch = buildStructurePatch({}, entry, {}, context);
  assert.deepEqual(Object.keys(patch).sort(), ['practicalLines','productionLines']);
  assert.equal('rank' in patch, false);
  assert.equal('strength' in patch, false);
  assert.equal('quality' in patch, false);
});

test('compliant entries are no-ops and live audit only returns non-compliant keys', () => {
  const state = {
    cards:{},
    entries:{
      good:{ key:'good', catalogueType:'taster', taster:true, productionLines:['Unflavoured','Handmade','Wrapper: A','Binder: B','Filler: C'], practicalLines:['Single cigar','Uncut','Protected','Lenient Cadence'] },
      bad:{ key:'bad', catalogueType:'half', title:'Example Lancero', length:3.5, ring:40, productionLines:['Handmade in Nicaragua','Wrapper: A','Binder: B','Filler: C'], practicalLines:['Two halves from one cigar','Pre-cut before lighting'] }
    }
  };
  assert.deepEqual(buildStructurePatch({}, state.entries.good, {}, context), {});
  assert.deepEqual(findNonCompliantKeys(state, { cards:{} }, context), ['bad']);
});
