import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readIntrinsics } from '../src/intrinsics.js';
import { hashBytes } from '../src/hash.js';
import { jpegBytes } from './helpers/images.js';

test('readIntrinsics computes hash + intrinsic facts for a JPEG in one pass', () => {
  const bytes = jpegBytes(4032, 3024, 7);
  const dir = mkdtempSync(join(tmpdir(), 'memex-intr-'));
  const path = join(dir, 'photo.jpeg');
  writeFileSync(path, bytes);

  const facts = readIntrinsics(path, 'photo.jpeg');

  assert.equal(facts.hex, hashBytes(bytes).hex);
  assert.equal(facts.ni, hashBytes(bytes).ni);
  assert.equal(facts.mimetype, 'image/jpeg');
  assert.equal(facts.byteSize, bytes.length);
  assert.equal(facts.width, 4032);
  assert.equal(facts.height, 3024);
});

test('readIntrinsics omits dimensions it cannot read (degrades gracefully)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-intr-'));
  const path = join(dir, 'note.txt');
  writeFileSync(path, 'plain text, no dimensions');

  const facts = readIntrinsics(path, 'note.txt');

  assert.equal(facts.mimetype, 'text/plain');
  assert.equal(facts.byteSize, 25);
  assert.equal('width' in facts, false);
  assert.equal('height' in facts, false);
  assert.equal('duration' in facts, false);
});
