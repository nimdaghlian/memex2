import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mimeForExt, mediaCategory } from '../src/mime.js';

test('mimeForExt maps known extensions (case-insensitive)', () => {
  assert.equal(mimeForExt('jpeg'), 'image/jpeg');
  assert.equal(mimeForExt('JPG'), 'image/jpeg');
  assert.equal(mimeForExt('mp4'), 'video/mp4');
  assert.equal(mimeForExt('mp3'), 'audio/mpeg');
  assert.equal(mimeForExt('pdf'), 'application/pdf');
});

test('mimeForExt returns null for unknown extensions', () => {
  assert.equal(mimeForExt('xyz'), null);
});

test('mediaCategory derives the category from the MIME prefix', () => {
  assert.equal(mediaCategory('image/jpeg'), 'image');
  assert.equal(mediaCategory('video/mp4'), 'video');
  assert.equal(mediaCategory('audio/mpeg'), 'audio');
  assert.equal(mediaCategory('application/pdf'), 'document');
  assert.equal(mediaCategory('text/plain'), 'document');
});
