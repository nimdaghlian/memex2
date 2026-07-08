import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { jpegBytes } from './helpers/images.js';

const REPO = join(import.meta.dirname, '..');
const BIN = join(REPO, 'bin', 'memex.js');

function run(args, cwd) {
  return execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
}

function scaffold() {
  const root = mkdtempSync(join(tmpdir(), 'memex-e2e-'));
  writeFileSync(join(root, 'memex.config.yml'), 'memexId: memex-e2e\nout: ./site\nlibrary: ./library\n');
  const photos = join(root, 'library', 'photos');
  mkdirSync(photos, { recursive: true });
  writeFileSync(join(photos, 'IMG_1758_122322.jpeg'), jpegBytes(4032, 3024, 1));
  writeFileSync(join(photos, 'belmont-is-closed_011824.jpeg'), jpegBytes(3072, 4080, 2));
  return { root, photos };
}

test('process → verify → update runs end-to-end through the CLI on real assets', () => {
  const { root, photos } = scaffold();

  const processOut = run(['process', 'library/photos'], root);
  assert.match(processOut, /process: 2 record\(s\), 1 collection/);
  assert.equal(existsSync(join(photos, 'manifest.json')), true);
  assert.equal(existsSync(join(root, 'site', 'items', 'img-1758-122322.md')), true);
  assert.equal(existsSync(join(root, 'site', 'collections', 'photos.md')), true);

  // Clean verify.
  assert.match(run(['verify', 'library/photos'], root), /verify: clean/);

  // Deleting an asset surfaces a warning but the command still succeeds (warn-only, exit 0).
  rmSync(join(photos, 'belmont-is-closed_011824.jpeg'));
  const verifyOut = run(['verify', 'library/photos'], root);
  assert.match(verifyOut, /deleted/);

  // A peer's manifest yields baseline Records via update.
  const peer = join(root, 'library', 'bob-trip');
  mkdirSync(peer, { recursive: true });
  writeFileSync(join(peer, 'manifest.json'), JSON.stringify({
    version: 1, originatedBy: 'memex-bob',
    items: [{ path: 'x.jpeg', hash: 'ffff9999', ni: 'ni:///sha-256;ffff9999', mimetype: 'image/jpeg', byteSize: 10, uploadDate: '2026-01-01T00:00:00.000Z' }],
  }));
  assert.match(run(['update'], root), /update: 1 record\(s\)/);
  assert.equal(existsSync(join(root, 'site', 'items', 'x.md')), true);
});

test('process exits non-zero when memexId is unset', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-e2e-'));
  writeFileSync(join(root, 'memex.config.yml'), 'out: ./site\n');
  mkdirSync(join(root, 'assets'));
  assert.throws(() => run(['process', 'assets'], root), /memexId/);
});
