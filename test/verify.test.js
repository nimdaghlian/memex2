import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runVerify } from '../src/commands/verify.js';
import { hashBytes } from '../src/hash.js';
import { writeManifest } from '../src/manifest.js';

function png(salt) {
  const buf = Buffer.alloc(25);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(10, 16);
  buf.writeUInt32BE(10, 20);
  buf[24] = salt;
  return buf;
}

function baseline(files) {
  const dir = mkdtempSync(join(tmpdir(), 'memex-vf-'));
  const items = [];
  for (const [name, buf] of Object.entries(files)) {
    writeFileSync(join(dir, name), buf);
    const { hex, ni } = hashBytes(buf);
    items.push({ path: name, hash: hex, ni, mimetype: 'image/png', byteSize: buf.length, uploadDate: '2026-07-07T00:00:00.000Z' });
  }
  writeManifest(dir, { version: 1, originatedBy: 'me', items });
  return dir;
}

const types = (r) => r.warnings.map(w => w.type).sort();

test('a clean directory produces no warnings', () => {
  const dir = baseline({ 'a.png': png(1), 'b.png': png(2) });
  const r = runVerify({ dir });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.ok, true);
});

test('a byte change is reported as changed', () => {
  const dir = baseline({ 'a.png': png(1), 'b.png': png(2) });
  writeFileSync(join(dir, 'a.png'), png(99)); // same path, new bytes
  const r = runVerify({ dir });
  assert.deepEqual(types(r), ['changed']);
  assert.equal(r.warnings[0].path, 'a.png');
});

test('a rename (same bytes, new path) is reported as renamed', () => {
  const dir = baseline({ 'a.png': png(1), 'b.png': png(2) });
  renameSync(join(dir, 'a.png'), join(dir, 'renamed.png'));
  const r = runVerify({ dir });
  assert.deepEqual(types(r), ['renamed']);
  assert.equal(r.warnings[0].from, 'a.png');
  assert.equal(r.warnings[0].to, 'renamed.png');
});

test('a deletion is reported as deleted', () => {
  const dir = baseline({ 'a.png': png(1), 'b.png': png(2) });
  rmSync(join(dir, 'b.png'));
  const r = runVerify({ dir });
  assert.deepEqual(types(r), ['deleted']);
  assert.equal(r.warnings[0].path, 'b.png');
});

test('a stray untracked asset is reported as stray', () => {
  const dir = baseline({ 'a.png': png(1) });
  writeFileSync(join(dir, 'extra.png'), png(42));
  const r = runVerify({ dir });
  assert.deepEqual(types(r), ['stray']);
  assert.equal(r.warnings[0].path, 'extra.png');
});

test('an unprocessed directory (no manifest) warns but does not throw', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-vf-'));
  const r = runVerify({ dir });
  assert.deepEqual(types(r), ['no-manifest']);
  assert.equal(r.ok, false);
});
