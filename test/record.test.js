import { test } from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { buildFrontmatter, serializeRecord } from '../src/record.js';

const ARGS = {
  title: 'IMG_1758_122322',
  ni: 'ni:///sha-256;q80B',
  path: 'fallen-trees/IMG_1758_122322.jpeg',
  uploadDate: '2026-07-07T12:00:00.000Z',
  tags: ['trees', 'winter'],
};

test('buildFrontmatter emits exactly title/item/path/uploadDate/tags, bare keys', () => {
  const fm = buildFrontmatter(ARGS);
  assert.deepEqual(Object.keys(fm), ['title', 'item', 'path', 'uploadDate', 'tags']);
  assert.equal(fm.title, 'IMG_1758_122322');
  assert.equal(fm.item, 'ni:///sha-256;q80B');
  assert.equal(fm.path, 'fallen-trees/IMG_1758_122322.jpeg');
  assert.equal(fm.uploadDate, '2026-07-07T12:00:00.000Z');
  assert.deepEqual(fm.tags, ['trees', 'winter']);
});

test('buildFrontmatter drops every byte-intrinsic and prefixed key', () => {
  const fm = buildFrontmatter(ARGS);
  for (const k of ['schema:sha256', 'schema:encodingFormat', 'schema:contentSize',
                   'schema:width', 'schema:height', 'schema:contentUrl', 'schema:image',
                   'memex:addedBy', 'sha256', 'encodingFormat', 'width', 'height']) {
    assert.equal(k in fm, false, `${k} must not be present`);
  }
});

test('buildFrontmatter omits path/uploadDate when not provided', () => {
  const fm = buildFrontmatter({ title: 'x', ni: 'ni:///sha-256;z', tags: [] });
  assert.equal('path' in fm, false);
  assert.equal('uploadDate' in fm, false);
});

test('serializeRecord round-trips the bare keys through YAML', () => {
  const parsed = yaml.load(serializeRecord(buildFrontmatter(ARGS), '').split('---')[1]);
  assert.equal(parsed.item, 'ni:///sha-256;q80B');
  assert.equal(parsed.path, 'fallen-trees/IMG_1758_122322.jpeg');
});
