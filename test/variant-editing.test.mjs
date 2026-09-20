import test from 'node:test';
import assert from 'node:assert/strict';

import {
  updateBlendVariant,
  updateSizeVariant,
  updateVariantScopedCopy,
  variantEditSnapshot
} from '../public/catalogue-variant-edit-model.mjs';
import { preserveViewport } from '../public/catalogue-variant-runtime.mjs';

const FIXTURE = {
  key:'variant-parent',
  brand:'Test',
  title:'Base',
  summaryHtml:'parent summary',
  productionLines:['Wrapper: Base'],
  experienceTags:['Parent tag'],
  sizeVariants:[
    { id:'small', label:'Small', title:'Small', length:4, ring:40, summaryHtml:'small summary' },
    { id:'large', label:'Large', title:'Large', length:6, ring:52, summaryHtml:'large summary' }
  ],
  defaultVariantId:'small',
  blendVariants:[
    { id:'natural', label:'Natural' },
    {
      id:'maduro', label:'Maduro', title:'Maduro',
      productionLines:['Wrapper: Maduro'],
      sizeVariants:[
        { id:'robusto', label:'Robusto', title:'Maduro Robusto', length:5, ring:50, summaryHtml:'maduro robusto' },
        { id:'toro', label:'Toro', title:'Maduro Toro', length:6, ring:52, summaryHtml:'maduro toro' }
      ],
      defaultVariantId:'robusto'
    }
  ],
  defaultBlendVariantId:'natural'
};

test('editing a base-blend size updates the parent size list, not the blend shell', () => {
  const updated = updateSizeVariant(FIXTURE, 'large', { summaryHtml:'edited large' }, 'natural');
  assert.equal(updated.sizeVariants[1].summaryHtml, 'edited large');
  assert.equal(updated.sizeVariants[0].summaryHtml, 'small summary');
  assert.equal(updated.blendVariants[0].sizeVariants, undefined);
});

test('editing a size inside an alternate blend stays inside that blend', () => {
  const updated = updateSizeVariant(FIXTURE, 'toro', { title:'Edited Maduro Toro', packageCount:10 }, 'maduro');
  assert.equal(updated.blendVariants[1].sizeVariants[1].title, 'Edited Maduro Toro');
  assert.equal(updated.blendVariants[1].sizeVariants[1].packageCount, 10);
  assert.equal(updated.sizeVariants[1].title, 'Large');
});

test('editing a blend preserves every unrelated blend and size', () => {
  const updated = updateBlendVariant(FIXTURE, 'maduro', {
    productionLines:['Wrapper: Edited Maduro'],
    strength:9
  });
  assert.deepEqual(updated.blendVariants[0], FIXTURE.blendVariants[0]);
  assert.equal(updated.blendVariants[1].strength, 9);
  assert.deepEqual(updated.blendVariants[1].sizeVariants, FIXTURE.blendVariants[1].sizeVariants);
});

test('direct copy editing partitions size copy from blend Production and Experience', () => {
  const updated = updateVariantScopedCopy(FIXTURE, {
    blendVariantId:'maduro',
    sizeVariantId:'toro'
  }, {
    summaryHtml:'edited toro copy',
    noteHtml:'edited note',
    eyebrow:'edited eyebrow',
    practicalLines:['Single cigar','Forgiving Cadence'],
    productionLines:['Wrapper: New Maduro'],
    experienceTags:['Strong']
  });

  const maduro = updated.blendVariants[1];
  assert.equal(maduro.productionLines[0], 'Wrapper: New Maduro');
  assert.deepEqual(maduro.experienceTags, ['Strong']);
  assert.equal(maduro.sizeVariants[1].summaryHtml, 'edited toro copy');
  assert.equal(maduro.sizeVariants[1].noteHtml, 'edited note');
  assert.equal(maduro.sizeVariants[0].summaryHtml, 'maduro robusto');
  assert.equal(updated.summaryHtml, 'parent summary');
});

test('variant editor snapshot shows inherited base-blend values without inventing raw overrides', () => {
  const snapshot = variantEditSnapshot(FIXTURE, 'blend', 'natural');
  assert.equal(snapshot.raw.label, 'Natural');
  assert.equal(snapshot.raw.packageCount, undefined);
  assert.equal(snapshot.effective.title, 'Base');
  assert.equal(snapshot.effective.summaryHtml, 'parent summary');
});

test('viewport preservation restores scroll after synchronous and animation-frame movement', () => {
  const previousWindow = globalThis.window;
  const calls = [];
  const fake = {
    scrollX:17,
    scrollY:640,
    scrollTo(x,y) {
      this.scrollX = x;
      this.scrollY = y;
      calls.push([x,y]);
    },
    requestAnimationFrame(callback) {
      this.scrollY = 0;
      callback();
      return 1;
    }
  };
  globalThis.window = fake;
  try {
    const result = preserveViewport(() => {
      fake.scrollY = 120;
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(fake.scrollX, 17);
    assert.equal(fake.scrollY, 640);
    assert.ok(calls.some(([,y]) => y === 640));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
