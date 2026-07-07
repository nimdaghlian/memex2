import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MANIFEST_NAME,
  readManifest,
  writeManifest,
  itemFromFacts,
  mergeManifest,
} from '../src/manifest.js';

function facts(hex, extra = {}) {
  return { hex, ni: `ni:///sha-256;${hex}`, mimetype: 'image/jpeg', byteSize: 100, ...extra };
}

test('readManifest returns null for an unprocessed (untracked) directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-mf-'));
  assert.equal(readManifest(dir), null);
});

test('writeManifest writes manifest.json inside the directory and readManifest reads it back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-mf-'));
  const manifest = { version: 1, originatedBy: 'memex-alice', items: [] };
  writeManifest(dir, manifest);

  assert.equal(existsSync(join(dir, MANIFEST_NAME)), true);
  assert.deepEqual(readManifest(dir), manifest);
});

test('itemFromFacts shapes a manifest entry, dropping absent optional fields', () => {
  const entry = itemFromFacts('a.jpeg', facts('aaaa', { width: 10, height: 20 }));
  assert.deepEqual(entry, {
    path: 'a.jpeg', hash: 'aaaa', ni: 'ni:///sha-256;aaaa',
    mimetype: 'image/jpeg', byteSize: 100, width: 10, height: 20,
  });
  assert.equal('duration' in itemFromFacts('b.txt', facts('bbbb')), false);
});

test('mergeManifest into an empty manifest stamps originatedBy and uploadDate on new items', () => {
  const { manifest, added, changed } = mergeManifest(null, [
    itemFromFacts('a.jpeg', facts('aaaa')),
  ], { originatedBy: 'memex-alice', now: '2026-07-07T00:00:00.000Z' });

  assert.equal(manifest.version, 1);
  assert.equal(manifest.originatedBy, 'memex-alice');
  assert.equal(manifest.items[0].uploadDate, '2026-07-07T00:00:00.000Z');
  assert.deepEqual(added, ['a.jpeg']);
  assert.deepEqual(changed, []);
});

test('re-running adds a new file without disturbing existing entries', () => {
  const first = mergeManifest(null, [itemFromFacts('a.jpeg', facts('aaaa'))],
    { originatedBy: 'me', now: '2026-01-01T00:00:00.000Z' }).manifest;

  const { manifest, added, changed } = mergeManifest(first, [
    itemFromFacts('a.jpeg', facts('aaaa')),
    itemFromFacts('b.jpeg', facts('bbbb')),
  ], { originatedBy: 'me', now: '2026-02-02T00:00:00.000Z' });

  const a = manifest.items.find(i => i.path === 'a.jpeg');
  const b = manifest.items.find(i => i.path === 'b.jpeg');
  assert.equal(a.uploadDate, '2026-01-01T00:00:00.000Z'); // untouched
  assert.equal(b.uploadDate, '2026-02-02T00:00:00.000Z'); // new
  assert.deepEqual(added, ['b.jpeg']);
  assert.deepEqual(changed, []);
});

test('a byte change updates the hash and is reported as changed (preserving uploadDate)', () => {
  const first = mergeManifest(null, [itemFromFacts('a.jpeg', facts('aaaa'))],
    { originatedBy: 'me', now: '2026-01-01T00:00:00.000Z' }).manifest;

  const { manifest, added, changed } = mergeManifest(first, [
    itemFromFacts('a.jpeg', facts('cccc')),
  ], { originatedBy: 'me', now: '2026-03-03T00:00:00.000Z' });

  const a = manifest.items.find(i => i.path === 'a.jpeg');
  assert.equal(a.hash, 'cccc');
  assert.equal(a.uploadDate, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(added, []);
  assert.deepEqual(changed, ['a.jpeg']);
});

test('manifest items are written sorted by path for deterministic output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-mf-'));
  const { manifest } = mergeManifest(null, [
    itemFromFacts('z.jpeg', facts('zzzz')),
    itemFromFacts('a.jpeg', facts('aaaa')),
  ], { originatedBy: 'me', now: '2026-01-01T00:00:00.000Z' });
  writeManifest(dir, manifest);

  const raw = JSON.parse(readFileSync(join(dir, MANIFEST_NAME), 'utf8'));
  assert.deepEqual(raw.items.map(i => i.path), ['a.jpeg', 'z.jpeg']);
});
