import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { jpegBytes } from './helpers/images.js';

const REPO = join(import.meta.dirname, '..');
const BIN = join(REPO, 'bin', 'memex.js');

// Drive the wizard by piping a scripted answer sequence to stdin. The sequence MUST end in the
// quit choice (7) so the loop returns before stdin closes; the timeout guards against a hang.
function runWizard(stdin, cwd) {
  return execFileSync('node', [BIN], { cwd, input: stdin, encoding: 'utf8', timeout: 15000 });
}

test('running with no args launches the wizard and quits cleanly', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-wiz-e2e-'));
  const out = runWizard('7\n', root);
  assert.match(out, /1\) Process a directory/);
  assert.match(out, /7\) Quit/);
});

test('the create-config flow writes memex.config.yml', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-wiz-e2e-'));
  // 5=create config → memexId → out(default) → library(default) → 7=quit
  runWizard('5\nmemex-e2e\n\n\n7\n', root);

  const cfgPath = join(root, 'memex.config.yml');
  assert.equal(existsSync(cfgPath), true);
  assert.match(readFileSync(cfgPath, 'utf8'), /memexId: memex-e2e/);
});

test('the process flow catalogs a picked library directory end-to-end', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-wiz-e2e-'));
  writeFileSync(join(root, 'memex.config.yml'), 'memexId: memex-e2e\nout: ./site\nlibrary: ./library\n');
  const photos = join(root, 'library', 'photos');
  mkdirSync(photos, { recursive: true });
  writeFileSync(join(photos, 'shot.jpeg'), jpegBytes(640, 480, 1));

  // 1=process → 1=pick photos → tags(none) → 7=quit
  const out = runWizard('1\n1\n\n7\n', root);
  assert.match(out, /process: 1 record\(s\)/);
  assert.equal(existsSync(join(root, 'site', 'items', 'shot.md')), true);
});
