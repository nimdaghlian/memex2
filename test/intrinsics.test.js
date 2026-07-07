import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readIntrinsics } from '../src/intrinsics.js';
import { hashFile } from '../src/hash.js';

const FIXTURES = join(import.meta.dirname, '..', 'make-gals-copy', 'fallen-trees');

test('readIntrinsics computes hash + intrinsic facts for a JPEG in one pass', () => {
  const path = join(FIXTURES, 'IMG_1758_122322.jpeg');
  const facts = readIntrinsics(path, 'IMG_1758_122322.jpeg');

  assert.equal(facts.hex, hashFile(path).hex);
  assert.equal(facts.ni, hashFile(path).ni);
  assert.equal(facts.mimetype, 'image/jpeg');
  assert.equal(facts.byteSize, 3243488);
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
