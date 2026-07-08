import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

import { jpegBytes } from './helpers/images.js';

const REPO = join(import.meta.dirname, '..');
const BIN = join(REPO, 'bin', 'memex.js');

function run(args, cwd) {
  return execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
}

function scaffold() {
  const root = mkdtempSync(join(tmpdir(), 'memex-tag-e2e-'));
  writeFileSync(join(root, 'memex.config.yml'), 'memexId: memex-e2e\nout: ./site\nlibrary: ./library\n');
  const photos = join(root, 'library', 'photos');
  mkdirSync(photos, { recursive: true });
  writeFileSync(join(photos, 'IMG_1758_122322.jpeg'), jpegBytes(4032, 3024, 1));
  return { root };
}

const recordTags = (root) => yaml.load(readFileSync(join(root, 'site', 'items', 'img-1758-122322.md'), 'utf8').split('---')[1]).tags;

test('process --tag seeds tags on every generated Record (repeatable flag)', () => {
  const { root } = scaffold();
  run(['process', 'library/photos', '--tag', 'trees', '--tag', 'winter'], root);
  assert.deepEqual(recordTags(root), ['trees', 'winter']);
});

test('tag command adds tags to a processed directory\'s Records', () => {
  const { root } = scaffold();
  run(['process', 'library/photos'], root);
  assert.deepEqual(recordTags(root), []);

  const out = run(['tag', 'library/photos', '--tag', 'oak'], root);
  assert.match(out, /tag: 1 record\(s\) tagged/);
  assert.deepEqual(recordTags(root), ['oak']);
});
