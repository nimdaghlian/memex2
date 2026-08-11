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

// `warn()` writes straight to stdout (src/output.js), so capturing it means swapping the writer.
function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
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

test('generated Record frontmatter carries the new contract', () => {
  const { dir, out } = setup();
  runProcess({ dir, out, memexId: 'memex-alice', now: NOW });

  const md = readFileSync(join(out, 'items', 'one.md'), 'utf8');
  const fm = yaml.load(md.split('---')[1]);
  const expected = hashBytes(readFileSync(join(dir, 'one.png')));
  assert.equal(fm.title, 'one');                 // filename without extension
  assert.equal(fm.item, expected.ni);
  assert.equal(fm.path, 'fallen-trees/one.png'); // dirName/filename (no library passed)
  assert.equal(fm.uploadDate, NOW);
  assert.deepEqual(fm.tags, []);
  assert.equal('schema:sha256' in fm, false);
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

test('processing a directory outside the configured library warns', () => {
  const { root, dir, out } = setup();
  const library = join(root, 'elsewhere');
  mkdirSync(library);

  const output = captureStdout(() =>
    runProcess({ dir, out, memexId: 'memex-alice', library, now: NOW }),
  );

  assert.match(output, /outside configured library/);
});

test('processing a directory inside the configured library does not warn', () => {
  const { root, dir, out } = setup();

  // setup() puts dir at <root>/fallen-trees, so root IS the library root here.
  const output = captureStdout(() =>
    runProcess({ dir, out, memexId: 'memex-alice', library: root, now: NOW }),
  );

  assert.doesNotMatch(output, /outside configured library/);
});
