import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanAssets } from '../src/scan.js';

test('scanAssets returns supported media files, sorted, excluding manifest/dotfiles/dirs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-scan-'));
  writeFileSync(join(dir, 'z.jpeg'), 'x');
  writeFileSync(join(dir, 'a.png'), 'x');
  writeFileSync(join(dir, 'notes.txt'), 'x');
  writeFileSync(join(dir, 'manifest.json'), '{}');
  writeFileSync(join(dir, '.DS_Store'), 'x');
  writeFileSync(join(dir, 'archive.zip'), 'x'); // unsupported ext
  mkdirSync(join(dir, 'subdir'));

  assert.deepEqual(scanAssets(dir), ['a.png', 'notes.txt', 'z.jpeg']);
});
