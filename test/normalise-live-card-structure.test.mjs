import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cadenceForRing,
  classifyStructureFamily,
  normaliseProductionLines,
  normalisePracticalLines,
  parseStaticCardDimensions,
  buildStructureContext,
  buildStructurePatch,
  buildStructurePreview,
  findNonCompliantKeys
} from '../scripts/normalise-live-card-structure.mjs';

const context = {
  subsectionByKey: new Map([
    ['liga-no9', 'coronets-cigarillos'],
    ['regular', 'petit-panatelas'],
    ['flavoured-main', 'flavoured-infused']
  ]),
  dimensionsByKey: new Map()
};

test('classifies the four approved structure families from live catalogue role and subsection', () => {
  assert.equal(classifyStructureFamily({ key:'liga-no9', catalogueType:'main', ring:32 }, context), 'coronet-flavoured');
  assert.equal(classifyStructureFamily({ key:'flavoured-main', catalogueType:'main', ring:44 }, context), 'coronet-flavoured');
  assert.equal(classifyStructureFamily({ key:'regular', catalogueType:'main', ring:43 }, context), 'regular-main');
  assert.equal(classifyStructureFamily({ key:'t', catalogueType:'taster', taster:true }, context), 'taster');
  assert.equal(classifyStructureFamily({ key:'h', catalogueType:'half' }, context), 'half');
});

test('cadence is decided by ring gauge alone at the stated boundaries', () => {
  assert.equal(cadenceForRing(20), 'Sensitive Cadence');
  assert.equal(cadenceForRing(32), 'Sensitive Cadence');
  assert.equal(cadenceForRing(33), 'Lenient Cadence');
  assert.equal(cadenceForRing(40), 'Lenient Cadence');
  assert.equal(cadenceForRing(41), 'Forgiving Cadence');
  assert.equal(cadenceForRing(60), 'Forgiving Cadence');
});

test('cadence ignores whatever wording the card already carried', () => {
  const record = {
    key:'regular',
    ring:46,
    practicalLines:['Single cigar','Uncut','Fragile','Slow Cadence']
  };
  assert.equal(normalisePracticalLines(record, context).at(-1), 'Forgiving Cadence');
});

test('an unedited static card takes its cadence from the page markup, not a default', () => {
  const html = '<article class="card" data-key="static-coronet"><div class="artframe" data-visual-length="4" data-visual-ring="32"></div></article>';
  const live = buildStructureContext({}, {}, html);
  assert.deepEqual(parseStaticCardDimensions(html).get('static-coronet'), { length:4, ring:32 });
  // No ring anywhere on the record: without the markup fallback this would silently fall
  // back to Lenient and relabel a narrow cigar.
  assert.equal(normalisePracticalLines({ key:'static-coronet' }, live).at(-1), 'Sensitive Cadence');
});

test('Production shows Flavoured on infused blends and prints nothing for the rest', () => {
  const flavoured = {
    key:'flavoured-main',
    productionLines:[
      'Flavoured',
      'Handmade in Nicaragua',
      'Wrapper: Mexican San Andrés maduro',
      'Binder: Indonesian',
      'Filler: Indonesian and Nicaraguan'
    ]
  };
  assert.deepEqual(normaliseProductionLines(flavoured, context), [
    'Flavoured',
    'Handmade',
    'Wrapper: Mexican San Andrés maduro',
    'Binder: Indonesian',
    'Filler: Indonesian and Nicaraguan'
  ]);

  const unflavoured = {
    key:'liga-no9',
    productionLines:[
      'Unflavoured',
      'Handmade in Nicaragua',
      'Wrapper: Ecuadorian Habano',
      'Binder: Brazilian Cubra',
      'Filler: Brazilian and Dominican'
    ]
  };
  assert.deepEqual(normaliseProductionLines(unflavoured, context), [
    'Handmade',
    'Wrapper: Ecuadorian Habano',
    'Binder: Brazilian Cubra',
    'Filler: Brazilian and Dominican'
  ]);
});

test('a fact does not keep the conjunction that joined a trimmed clause', () => {
  const record = {
    key:'regular',
    productionLines:[
      'Handmade',
      'Wrapper: Cuban',
      'Binder: Selected Vuelta Abajo short-filler and tobaccos from the same farm',
      'Filler: Cuban ligero and seco tobaccos'
    ]
  };
  const lines = normaliseProductionLines(record, context);
  // The trimmed "tobaccos" clause must not leave its conjunction stranded...
  assert.deepEqual(lines[2], 'Binder: Selected Vuelta Abajo short-filler');
  // ...but a conjunction joining two real values is part of the value.
  assert.deepEqual(lines[3], 'Filler: Cuban ligero and seco');
});

test('regular-main Production is the same four-line block as every other section', () => {
  const record = {
    key:'regular',
    productionLines:[
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

test('regular-main Practical is package, cut, protection, cadence with no form or role lines', () => {
  const record = {
    key:'regular',
    title:'Undercrown 10 Corona Viva — Single',
    packageLabel:'single cigar',
    length:5,
    ring:43,
    practicalLines:['Single cigar','5″ × 43 Corona Viva','A$39 single','Long-filler construction','Direct Undercrown 10 blend taster','Slow cadence recommended']
  };
  assert.deepEqual(normalisePracticalLines(record, context), [
    'Single cigar',
    'Uncut',
    'Fragile',
    'Forgiving Cadence'
  ]);
});

test('taster Practical collapses to the same four lines', () => {
  const record = {
    key:'t',
    catalogueType:'taster',
    taster:true,
    title:'Isla del Sol Maduro Gran Corona — Single',
    packageLabel:'single cigar',
    ring:46,
    productionLines:['Flavoured','Handmade in Nicaragua','Wrapper: Mexican San Andrés maduro','Binder: Indonesian','Filler: Indonesian and Nicaraguan'],
    practicalLines:['Single cigar','5″ × 46 Gran Corona','A$37.39 single','Uncut','Protected','Long-filler construction','Forgiving Cadence']
  };
  assert.deepEqual(normaliseProductionLines(record, context), [
    'Flavoured','Handmade','Wrapper: Mexican San Andrés maduro','Binder: Indonesian','Filler: Indonesian and Nicaraguan'
  ]);
  assert.deepEqual(normalisePracticalLines(record, context), [
    'Single cigar','Uncut','Protected','Forgiving Cadence'
  ]);
});

test('a sealed pack protects its contents the same way a tin does', () => {
  const record = { key:'flavoured-main', packageLabel:'pack of 10', ring:32, practicalLines:['Pack of 10'] };
  assert.deepEqual(normalisePracticalLines(record, context), ['Pack of 10','Uncut','Protected','Sensitive Cadence']);
});

test('half Practical keeps the full-cigar line before cadence and drops the sessions line', () => {
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
      'This keeps the current full-bodied Broadleaf blend inside the catalogue’s practical-session target.'
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
    'Lenient Cadence'
  ]);
});

test('a half that lost its catalogueType is still normalised as a half', () => {
  const byKey = {
    key:'rocky-patel-sun-grown-maduro-lancero-half',
    title:'Rocky Patel Sun Grown Maduro Lancero',
    ring:38,
    length:3.75,
    practicalLines:['Single full lancero','Cut','Fragile','Full cigar: 7½″ × 38 Lancero','Two 3¾″ × 38 sessions','Slow Cadence']
  };
  assert.equal(classifyStructureFamily(byKey, context), 'half');
  assert.deepEqual(normalisePracticalLines(byKey, context), [
    'Two Halves','Cut','Fragile','Full cigar: 7½″ × 38 Lancero','Lenient Cadence'
  ]);

  // The full-cigar line alone is enough evidence even without the key suffix.
  const byLine = { key:'mystery', practicalLines:['Single cigar','Cut','Fragile','Full cigar: 7″ × 40 Lancero'], ring:40, length:3.5 };
  assert.equal(classifyStructureFamily(byLine, context), 'half');
});

test('every single reads "Single cigar" and only a tubo keeps its own word', () => {
  const vitolaNamed = { key:'regular', ring:48, practicalLines:['Single Churchill','Cut','Fragile'] };
  assert.equal(normalisePracticalLines(vitolaNamed, context)[0], 'Single cigar');

  const tubo = { key:'regular', ring:44, practicalLines:['Single tubo','Uncut','Protected'] };
  assert.equal(normalisePracticalLines(tubo, context)[0], 'Single tubo');

  const fromLabel = { key:'regular', ring:44, packageLabel:'single full lancero' };
  assert.equal(normalisePracticalLines(fromLabel, context)[0], 'Single cigar');
});

test('normalisation is idempotent, so a published card never needs a second write', () => {
  const records = [
    { key:'regular', title:'Undercrown 10 Corona Viva — Single', ring:43, length:5,
      productionLines:['Handmade','Wrapper: A','Binder: B','Filler: C'],
      practicalLines:['Single cigar','Uncut','Fragile','Slow Cadence'] },
    { key:'flavoured-main', ring:32, packageLabel:'pack of 10',
      productionLines:['Flavoured','Handmade','Wrapper: A','Binder: B','Filler: C'],
      practicalLines:['Pack of 10','Uncut','Protected','Lenient Cadence'] },
    { key:'h', catalogueType:'half', title:'Example Lancero', ring:40, length:3.5,
      productionLines:['Handmade','Wrapper: A','Binder: B','Filler: C'],
      practicalLines:['Two Halves','Cut','Fragile','Full cigar: 7″ × 40 Lancero','Slow Cadence'] }
  ];
  for (const record of records) {
    const once = {
      ...record,
      productionLines:normaliseProductionLines(record, context),
      practicalLines:normalisePracticalLines(record, context)
    };
    assert.deepEqual(normaliseProductionLines(once, context), once.productionLines, `${record.key} Production must settle`);
    assert.deepEqual(normalisePracticalLines(once, context), once.practicalLines, `${record.key} Practical must settle`);
    assert.deepEqual(buildStructurePatch({}, once, {}, context, record.key), {}, `${record.key} must not need a second write`);
  }
});

test('compliance is measured against what renders, not the publisher-derived card line array', () => {
  const compliant = ['Handmade','Wrapper: Mexican San Andrés','Binder: Connecticut Broadleaf','Filler: Nicaraguan'];
  const card = {
    // What the page renders for this card: already in house format.
    productionHtml: compliant.map(line => `<span class="artmeta-line">${line}</span>`).join(''),
    practicalHtml: ['Tin of 10','Uncut','Protected','Sensitive Cadence'].map(line => `<span class="artmeta-line">${line}</span>`).join(''),
    // What the publisher re-derives from public/index.html on every publish and never
    // renders. Reading this made the card look non-compliant forever: the normaliser
    // rewrote it, the next publish put the stale array back, and round it went.
    productionLines: ['Unflavoured','Handmade','San Andrés maduro wrapper.'],
    ring: 32
  };
  assert.deepEqual(buildStructurePatch(card, undefined, {}, context, 'liga-no9'), {});
});

test('a dynamic entry is still measured by its own line array', () => {
  const entry = {
    key:'liga-no9', ring:32,
    productionLines:['Handmade','Wrapper: A','Binder: B','Filler: C'],
    practicalLines:['Tin of 10','Uncut','Protected','Lenient Cadence']
  };
  // The card markup agrees on Production but the entry's cadence is wrong for ring 32,
  // and the entry is what renders, so the patch must still correct it.
  const card = { productionHtml:'<span class="artmeta-line">Handmade</span>' };
  const patch = buildStructurePatch(card, entry, {}, context, 'liga-no9');
  assert.deepEqual(Object.keys(patch), ['practicalLines']);
  assert.deepEqual(patch.practicalLines, ['Tin of 10','Uncut','Protected','Sensitive Cadence']);
});

test('buildStructurePatch is minimal and never alters rank or ratings', () => {
  const entry = {
    key:'regular', rank:7, strength:8, quality:9, ring:43,
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
      good:{ key:'good', catalogueType:'taster', taster:true, ring:46, productionLines:['Handmade','Wrapper: A','Binder: B','Filler: C'], practicalLines:['Single cigar','Uncut','Protected','Forgiving Cadence'] },
      bad:{ key:'bad', catalogueType:'half', title:'Example Lancero', length:3.5, ring:40, productionLines:['Handmade in Nicaragua','Wrapper: A','Binder: B','Filler: C'], practicalLines:['Two halves from one cigar','Pre-cut before lighting'] }
    }
  };
  assert.deepEqual(buildStructurePatch({}, state.entries.good, {}, context), {});
  assert.deepEqual(findNonCompliantKeys(state, { cards:{} }, context), ['bad']);
});

test('preview reports the before and after for every card it would touch and writes nothing', () => {
  const state = {
    cards:{},
    entries:{
      bad:{ key:'bad', ring:43, subsection:'petit-panatelas', title:'Example Corona',
        productionLines:['Unflavoured','Handmade','Wrapper: A','Binder: B','Filler: C'],
        practicalLines:['Single cigar','Uncut','Fragile','Long-filler construction','Compact format','Slow Cadence'] }
    },
    sections:{ recommendationSubsections:[{ id:'petit-panatelas', entryKeys:['bad'] }] }
  };
  const preview = buildStructurePreview(state, { cards:{} }, '');
  assert.equal(preview.length, 1);
  assert.equal(preview[0].key, 'bad');
  assert.deepEqual(preview[0].before.practical, ['Single cigar','Uncut','Fragile','Long-filler construction','Compact format','Slow Cadence']);
  assert.deepEqual(preview[0].after.practical, ['Single cigar','Uncut','Fragile','Forgiving Cadence']);
  assert.deepEqual(preview[0].after.production, ['Handmade','Wrapper: A','Binder: B','Filler: C']);
});
