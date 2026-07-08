import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
