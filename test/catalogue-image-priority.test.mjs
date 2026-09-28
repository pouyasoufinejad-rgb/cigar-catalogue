import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePriorityBand, promoteArtworkImage } from '../public/catalogue-image-priority.mjs';

test('image priority bands warm artwork before it reaches the viewport', () => {
  assert.equal(imagePriorityBand({ top:100, bottom:600 }, 900), 'visible');
  assert.equal(imagePriorityBand({ top:1400, bottom:1800 }, 900), 'warm');
  assert.equal(imagePriorityBand({ top:4000, bottom:4400 }, 900), 'far');
});

test('visible artwork becomes eager/high while nearby artwork is warmed without changing its source', () => {
  const img = { loading:'lazy', decoding:'auto', fetchPriority:'low', complete:false, src:'/art/example.webp' };
  promoteArtworkImage(img, 'warm');
  assert.equal(img.loading, 'eager');
  assert.equal(img.fetchPriority, 'auto');
  assert.equal(img.decoding, 'async');
  assert.equal(img.src, '/art/example.webp');

  promoteArtworkImage(img, 'visible');
  assert.equal(img.loading, 'eager');
  assert.equal(img.fetchPriority, 'high');
  assert.equal(img.src, '/art/example.webp');
});

test('far artwork stays lazy and low-priority so predictive warming does not restore the old all-images download', () => {
  const img = { loading:'eager', decoding:'auto', fetchPriority:'auto', complete:false, src:'/api/catalogue-image/example?v=1' };
  promoteArtworkImage(img, 'far');
  assert.equal(img.loading, 'lazy');
  assert.equal(img.fetchPriority, 'low');
  assert.equal(img.src, '/api/catalogue-image/example?v=1');
});
