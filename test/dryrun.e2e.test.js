import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

import { jpegBytes } from './helpers/images.js';

const REPO = join(import.meta.dirname, '..');
const BIN = join(REPO, 'bin', 'memex.js');

test('CLI generates the new contract; Eleventy builds pages with resolved links', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-dry-'));
  try {
    writeFileSync(join(root, 'memex.config.yml'), 'memexId: m\nout: ./site\nlibrary: ./library\n');
    const dir = join(root, 'library', 'forest');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'redwoods.jpeg'), jpegBytes(100, 80, 1));
    writeFileSync(join(dir, 'ferns.jpeg'), jpegBytes(90, 60, 2));

    execFileSync('node', [BIN, 'process', 'library/forest'], { cwd: root });

    // Curator adds a mutual wikilink to a generated Record body.
    const redwoods = join(root, 'site', 'items', 'redwoods.md');
    writeFileSync(redwoods, readFileSync(redwoods, 'utf8') + '\nSee [[ferns]].\n');

    const fm = yaml.load(readFileSync(redwoods, 'utf8').split('---')[1]);
    assert.equal(fm.item.startsWith('ni:///sha-256;'), true);
    assert.equal(fm.path, 'forest/redwoods.jpeg');
    assert.equal('schema:sha256' in fm, false);

    // Build the site against this repo's eleventy config.
    cpSync(join(REPO, 'eleventy.config.js'), join(root, 'eleventy.config.js'));
    cpSync(join(REPO, 'site', '_includes'), join(root, 'site', '_includes'), { recursive: true });
    cpSync(join(REPO, 'site', '_lib'), join(root, 'site', '_lib'), { recursive: true });
    mkdirSync(join(root, 'site', 'items'), { recursive: true });
    cpSync(join(REPO, 'site', 'items', 'items.11tydata.js'), join(root, 'site', 'items', 'items.11tydata.js'));
    mkdirSync(join(root, 'site', 'collections'), { recursive: true });
    cpSync(join(REPO, 'site', 'collections', 'collections.11tydata.js'), join(root, 'site', 'collections', 'collections.11tydata.js'));
    execFileSync('npx', ['@11ty/eleventy'], { cwd: root });

    assert.equal(existsSync(join(root, '_site', 'items', 'redwoods', 'index.html')), true);
    const html = readFileSync(join(root, '_site', 'items', 'redwoods', 'index.html'), 'utf8');
    assert.match(html, /href="\/items\/ferns\/"/);

    // The CLI also generates a baseline Collection for the processed directory ("forest"),
    // whose body links each member Record by basename — that page's wikilinks must resolve too.
    assert.equal(existsSync(join(root, '_site', 'collections', 'forest', 'index.html')), true);
    const collectionHtml = readFileSync(join(root, '_site', 'collections', 'forest', 'index.html'), 'utf8');
    assert.match(collectionHtml, /href="\/items\/redwoods\/"/);
    assert.match(collectionHtml, /href="\/items\/ferns\/"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
