import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';

import { runProcess } from '../src/commands/process.js';
import { runTag } from '../src/commands/tag.js';
import { serializeRecord, parseRecord } from '../src/record.js';

function png(width, height, salt) {
  const buf = Buffer.alloc(25);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = salt;
  return buf;
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'memex-tag-'));
  const dir = join(root, 'trees');
  mkdirSync(dir);
  writeFileSync(join(dir, 'one.png'), png(10, 10, 1));
  writeFileSync(join(dir, 'two.png'), png(20, 20, 2));
  const out = join(root, 'site');
  runProcess({ dir, out, memexId: 'me', now: '2026-07-07T00:00:00.000Z' });
  return { dir, out };
}

const tagsOf = (out, name) => yaml.load(readFileSync(join(out, 'items', name), 'utf8').split('---')[1]).tags;

test('tag adds tags to every Record of a processed directory', () => {
  const { dir, out } = setup();
  const summary = runTag({ dir, out, tags: ['trees', 'winter'] });

  assert.equal(summary.tagged, 2);
  assert.deepEqual(tagsOf(out, 'one.md'), ['trees', 'winter']);
  assert.deepEqual(tagsOf(out, 'two.md'), ['trees', 'winter']);
});

test('tag preserves the curated Record body', () => {
  const { dir, out } = setup();
  // Simulate curation: add prose + a wikilink to a Record.
  const path = join(out, 'items', 'one.md');
  const { frontmatter, body } = parseRecord(readFileSync(path, 'utf8'));
  writeFileSync(path, serializeRecord(frontmatter, 'A fallen oak. See [[two]].'));

  runTag({ dir, out, tags: ['trees'] });

  const after = parseRecord(readFileSync(path, 'utf8'));
  assert.equal(after.body, 'A fallen oak. See [[two]].');
  assert.deepEqual(after.frontmatter.tags, ['trees']);
});

test('tag is idempotent and merges without duplicating', () => {
  const { dir, out } = setup();
  runTag({ dir, out, tags: ['trees'] });
  const second = runTag({ dir, out, tags: ['trees'] });
  assert.equal(second.tagged, 0);

  const third = runTag({ dir, out, tags: ['trees', 'oak'] });
  assert.equal(third.tagged, 2);
  assert.deepEqual(tagsOf(out, 'one.md'), ['trees', 'oak']);
});

test('tag only touches Records belonging to the given directory', () => {
  const { dir, out } = setup();

  // A second processed directory with its own Records.
  const otherDir = join(dir, '..', 'other');
  mkdirSync(otherDir);
  writeFileSync(join(otherDir, 'far.png'), png(30, 30, 9));
  runProcess({ dir: otherDir, out, memexId: 'me', now: '2026-07-07T00:00:00.000Z' });

  runTag({ dir, out, tags: ['trees'] });

  assert.deepEqual(tagsOf(out, 'far.md'), []); // untouched — not in `trees`
});

test('tag throws on an unprocessed directory (no manifest)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-tag-'));
  assert.throws(() => runTag({ dir, out: join(dir, 'site'), tags: ['x'] }), /manifest/i);
});
