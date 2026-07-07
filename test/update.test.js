import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';

import { runUpdate } from '../src/commands/update.js';

function peerItem(path, hex, extra = {}) {
  return { path, hash: hex, ni: `ni:///sha-256;${hex}`, mimetype: 'image/jpeg', byteSize: 100, uploadDate: '2026-06-01T00:00:00.000Z', ...extra };
}

function writeManifestFile(dir, manifest) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'memex-upd-'));
  const library = join(root, 'library');
  const out = join(root, 'site');

  // A peer (memex-bob) directory synced into my Library.
  writeManifestFile(join(library, 'bobs-trip'), {
    version: 1, originatedBy: 'memex-bob',
    items: [peerItem('sunset.jpeg', 'aaaa1111'), peerItem('beach.jpeg', 'bbbb2222')],
  });
  // A directory I originated — must be ignored by update.
  writeManifestFile(join(library, 'my-stuff'), {
    version: 1, originatedBy: 'memex-alice',
    items: [peerItem('mine.jpeg', 'cccc3333')],
  });

  return { root, library, out };
}

const NOW = '2026-07-07T12:00:00.000Z';

test('update generates baseline Records for a peer\'s untracked assets, with addedBy=peer', () => {
  const { library, out } = setup();
  const summary = runUpdate({ library, out, memexId: 'memex-alice', now: NOW });

  assert.equal(summary.records, 2);
  assert.equal(existsSync(join(out, 'items', 'sunset.md')), true);

  const fm = yaml.load(readFileSync(join(out, 'items', 'sunset.md'), 'utf8').split('---')[1]);
  assert.equal(fm['schema:sha256'], 'aaaa1111');
  assert.equal(fm['memex:addedBy'], 'memex-bob');
});

test('update ignores manifests I originated', () => {
  const { library, out } = setup();
  runUpdate({ library, out, memexId: 'memex-alice', now: NOW });
  assert.equal(existsSync(join(out, 'items', 'mine.md')), false);
});

test('update generates one baseline Collection per peer directory', () => {
  const { library, out } = setup();
  runUpdate({ library, out, memexId: 'memex-alice', now: NOW });
  assert.equal(existsSync(join(out, 'collections', 'bobs-trip.md')), true);
  assert.equal(existsSync(join(out, 'collections', 'my-stuff.md')), false);
});

test('update is idempotent — a second run writes nothing new', () => {
  const { library, out } = setup();
  runUpdate({ library, out, memexId: 'memex-alice', now: NOW });
  const second = runUpdate({ library, out, memexId: 'memex-alice', now: NOW });
  assert.equal(second.records, 0);
  assert.deepEqual(second.added, []);
});

test('update picks up a peer\'s incremental add on re-run', () => {
  const { library, out } = setup();
  runUpdate({ library, out, memexId: 'memex-alice', now: NOW });

  writeManifestFile(join(library, 'bobs-trip'), {
    version: 1, originatedBy: 'memex-bob',
    items: [peerItem('sunset.jpeg', 'aaaa1111'), peerItem('beach.jpeg', 'bbbb2222'), peerItem('pier.jpeg', 'dddd4444')],
  });
  const second = runUpdate({ library, out, memexId: 'memex-alice', now: NOW });

  assert.equal(second.records, 1);
  assert.deepEqual(second.added, ['dddd4444']);
  assert.equal(existsSync(join(out, 'items', 'pier.md')), true);
});
