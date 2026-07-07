import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { probeDimensions } from '../src/probe.js';

const FIXTURES = join(import.meta.dirname, '..', 'make-gals-copy', 'fallen-trees');

function pngHeader(width, height) {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function gifHeader(width, height) {
  const buf = Buffer.alloc(10);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

test('probeDimensions reads JPEG width/height from a real fixture', () => {
  const bytes = readFileSync(join(FIXTURES, 'IMG_1758_122322.jpeg'));
  assert.deepEqual(probeDimensions(bytes), { width: 4032, height: 3024 });
});

test('probeDimensions reads PNG dimensions', () => {
  assert.deepEqual(probeDimensions(pngHeader(100, 50)), { width: 100, height: 50 });
});

test('probeDimensions reads GIF dimensions', () => {
  assert.deepEqual(probeDimensions(gifHeader(30, 20)), { width: 30, height: 20 });
});

test('probeDimensions returns null for an unrecognized format', () => {
  assert.equal(probeDimensions(Buffer.from('not an image at all')), null);
});

test('probeDimensions degrades to null on a truncated JPEG without throwing', () => {
  assert.equal(probeDimensions(Buffer.from([0xff, 0xd8, 0xff])), null);
});
