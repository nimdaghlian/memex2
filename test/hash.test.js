import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { hashBytes, hashFile, hexToNi, niToHex } from '../src/hash.js';

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('hashBytes returns hex and ni for the same digest', () => {
  const bytes = Buffer.from('hello world');
  const digest = createHash('sha256').update(bytes).digest();

  const { hex, ni } = hashBytes(bytes);

  assert.equal(hex, digest.toString('hex'));
  assert.equal(ni, `ni:///sha-256;${b64url(digest)}`);
});

test('hashBytes is deterministic for identical bytes', () => {
  const a = hashBytes(Buffer.from('same bytes'));
  const b = hashBytes(Buffer.from('same bytes'));
  assert.deepEqual(a, b);
});

test('different bytes produce different hashes', () => {
  assert.notEqual(hashBytes(Buffer.from('a')).hex, hashBytes(Buffer.from('b')).hex);
});

test('hexToNi and niToHex round-trip', () => {
  const { hex, ni } = hashBytes(Buffer.from('round trip'));
  assert.equal(hexToNi(hex), ni);
  assert.equal(niToHex(ni), hex);
  assert.equal(niToHex(hexToNi(hex)), hex);
});

test('niToHex rejects a non-ni URI', () => {
  assert.throws(() => niToHex('https://example.com/foo'), /ni:/);
});

test('hashFile hashes file bytes identically regardless of path', () => {
  const dirA = mkdtempSync(join(tmpdir(), 'memex-a-'));
  const dirB = mkdtempSync(join(tmpdir(), 'memex-b-'));
  const content = Buffer.from('identical content across paths');
  writeFileSync(join(dirA, 'one.txt'), content);
  writeFileSync(join(dirB, 'two.dat'), content);

  const a = hashFile(join(dirA, 'one.txt'));
  const b = hashFile(join(dirB, 'two.dat'));

  assert.equal(a.hex, b.hex);
  assert.equal(a.ni, b.ni);
  assert.equal(a.hex, hashBytes(content).hex);
});
