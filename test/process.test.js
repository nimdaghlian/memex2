import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';

import { runProcess } from '../src/commands/process.js';
import { readManifest } from '../src/manifest.js';
import { hashBytes } from '../src/hash.js';
import { pngBytes as pngFile } from './helpers/images.js';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'memex-proc-'));
  const dir = join(root, 'fallen-trees');
  mkdirSync(dir);
  writeFileSync(join(dir, 'one.png'), pngFile(100, 50, 1));
  writeFileSync(join(dir, 'two.png'), pngFile(200, 80, 2));
  const out = join(root, 'site');
  return { root, dir, out };
}

const NOW = '2026-07-07T12:00:00.000Z';

test('runProcess writes a manifest, one Record per asset, and one Collection', () => {
  const { dir, out } = setup();
  const summary = runProcess({ dir, out, memexId: 'memex-alice', now: NOW });

  assert.equal(summary.records, 2);
  assert.equal(summary.collection, 1);

  const manifest = readManifest(dir);
  assert.equal(manifest.originatedBy, 'memex-alice');
  assert.equal(manifest.items.length, 2);
  assert.equal(manifest.items.every(i => i.uploadDate === NOW), true);

  assert.equal(existsSync(join(out, 'items', 'one.md')), true);
  assert.equal(existsSync(join(out, 'items', 'two.md')), true);
});

test('generated Record frontmatter carries the contract fields', () => {
  const { dir, out } = setup();
  runProcess({ dir, out, memexId: 'memex-alice', now: NOW });

  const md = readFileSync(join(out, 'items', 'one.md'), 'utf8');
  const fm = yaml.load(md.split('---')[1]);
  const expected = hashBytes(readFileSync(join(dir, 'one.png')));
  assert.equal(fm['schema:sha256'], expected.hex);
  assert.equal(fm.item, expected.ni);
  assert.equal(fm['schema:encodingFormat'], 'image/png');
  assert.equal(fm['schema:width'], 100);
  assert.equal(fm['schema:height'], 50);
  assert.equal(fm['memex:addedBy'], 'memex-alice');
});

test('the baseline Collection links every Record by basename', () => {
  const { dir, out } = setup();
  runProcess({ dir, out, memexId: 'memex-alice', now: NOW });

  const md = readFileSync(join(out, 'collections', 'fallen-trees.md'), 'utf8');
  assert.match(md, /- \[\[one\]\]/);
  assert.match(md, /- \[\[two\]\]/);
});

test('re-running with overwrite=false is idempotent (no spurious rewrites)', () => {
  const { dir, out } = setup();
  runProcess({ dir, out, memexId: 'memex-alice', now: NOW });
  const summary = runProcess({ dir, out, memexId: 'memex-alice', now: '2026-08-08T00:00:00.000Z' });

  assert.equal(summary.records, 0);
  assert.equal(summary.collection, 0);
  assert.deepEqual(summary.added, []);
});

test('an incremental add is picked up on re-run (manifest + new Record only)', () => {
  const { dir, out } = setup();
  runProcess({ dir, out, memexId: 'memex-alice', now: NOW });

  writeFileSync(join(dir, 'three.png'), pngFile(300, 120, 3));
  const summary = runProcess({ dir, out, memexId: 'memex-alice', now: '2026-09-09T00:00:00.000Z' });

  assert.equal(summary.records, 1);
  assert.deepEqual(summary.added, ['three.png']);
  assert.equal(readManifest(dir).items.length, 3);
  assert.equal(existsSync(join(out, 'items', 'three.md')), true);
});
