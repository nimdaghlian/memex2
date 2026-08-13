import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';

import { existsSync } from 'node:fs';
import { loadConfig, saveConfig, CONFIG_NAME } from '../src/config.js';

test('loadConfig reads memexId and resolves out/library against the config dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: memex-alice\nout: ./site\nlibrary: ./lib\n');

  const cfg = loadConfig({ cwd: dir });
  assert.equal(cfg.memexId, 'memex-alice');
  assert.equal(isAbsolute(cfg.out), true);
  assert.equal(cfg.out, join(dir, 'site'));
  assert.equal(cfg.library, join(dir, 'lib'));
});

test('loadConfig applies defaults when no config file is present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  const cfg = loadConfig({ cwd: dir });
  assert.equal(cfg.memexId, null);
  assert.equal(cfg.out, join(dir, 'site'));
});

test('saveConfig writes memex.config.yml that loadConfig reads back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  const path = saveConfig({ cwd: dir, memexId: 'memex-nim', out: './site', library: './library' });

  assert.equal(path, join(dir, CONFIG_NAME));
  assert.equal(existsSync(path), true);

  const cfg = loadConfig({ cwd: dir });
  assert.equal(cfg.memexId, 'memex-nim');
  assert.equal(cfg.out, join(dir, 'site'));
  assert.equal(cfg.library, join(dir, 'library'));
});

test('saveConfig and loadConfig round-trip a curatorName', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  saveConfig({ cwd: dir, memexId: 'memex-nim', curatorName: 'Nim', out: './site', library: './library' });
  assert.equal(loadConfig({ cwd: dir }).curatorName, 'Nim');
});

test('curatorName defaults to null when absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  assert.equal(loadConfig({ cwd: dir }).curatorName, null);
});

test('libraryMode and libraryUrl default to embedded and /library/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: memex-alice\n');

  const cfg = loadConfig({ cwd: dir });
  assert.equal(cfg.libraryMode, 'embedded');
  assert.equal(cfg.libraryUrl, '/library/');
});

test('loadConfig rejects a libraryMode outside embedded/external', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: memex-alice\nlibraryMode: hybrid\n');

  assert.throws(() => loadConfig({ cwd: dir }), /Invalid libraryMode "hybrid"/);
});

// The templates concatenate the prefix raw, so a missing trailing slash would glue the origin
// straight onto the first path segment: https://cdn.example.com/libfallen-trees/one.png
test('libraryUrl gains a trailing slash when it lacks one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: a\nlibraryUrl: https://cdn.example.com/lib\n');

  assert.equal(loadConfig({ cwd: dir }).libraryUrl, 'https://cdn.example.com/lib/');
});

test('a libraryUrl that already ends in a slash is left alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: a\nlibraryUrl: /assets/\n');

  assert.equal(loadConfig({ cwd: dir }).libraryUrl, '/assets/');
});

// An explicit empty string means "no prefix, the paths are already absolute" — a real choice,
// not a mistake, so it must not acquire a slash.
test('an empty libraryUrl stays empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: a\nlibraryUrl: ""\n');

  assert.equal(loadConfig({ cwd: dir }).libraryUrl, '');
});

test('saveConfig writes libraryMode and libraryUrl that loadConfig reads back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  saveConfig({ cwd: dir, memexId: 'memex-nim', libraryMode: 'external', libraryUrl: 'https://cdn.example.com/lib/' });

  const cfg = loadConfig({ cwd: dir });
  assert.equal(cfg.libraryMode, 'external');
  assert.equal(cfg.libraryUrl, 'https://cdn.example.com/lib/');
});

test('saveConfig defaults the new fields so generated configs are self-documenting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  saveConfig({ cwd: dir, memexId: 'memex-nim' });

  const written = readFileSync(join(dir, CONFIG_NAME), 'utf8');
  assert.match(written, /libraryMode: embedded/);
  assert.match(written, /libraryUrl: \/library\//);
});
