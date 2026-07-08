import { test } from 'node:test';
import assert from 'node:assert/strict';

import { probeDimensions } from '../src/probe.js';
import { pngBytes, gifBytes, jpegBytes } from './helpers/images.js';

test('probeDimensions reads JPEG width/height (walking past the APP0 segment)', () => {
  assert.deepEqual(probeDimensions(jpegBytes(4032, 3024)), { width: 4032, height: 3024 });
});

test('probeDimensions reads PNG dimensions', () => {
  assert.deepEqual(probeDimensions(pngBytes(100, 50)), { width: 100, height: 50 });
});

test('probeDimensions reads GIF dimensions', () => {
  assert.deepEqual(probeDimensions(gifBytes(30, 20)), { width: 30, height: 20 });
});

test('probeDimensions returns null for an unrecognized format', () => {
  assert.equal(probeDimensions(Buffer.from('not an image at all')), null);
});

test('probeDimensions degrades to null on a truncated JPEG without throwing', () => {
  assert.equal(probeDimensions(Buffer.from([0xff, 0xd8, 0xff])), null);
});
