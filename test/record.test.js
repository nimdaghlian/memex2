import { test } from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';

import { buildFrontmatter, serializeRecord } from '../src/record.js';

const IMAGE_FACTS = {
  hex: 'abc123',
  ni: 'ni:///sha-256;q80B',
  mimetype: 'image/jpeg',
  byteSize: 3243488,
  width: 4032,
  height: 3024,
};

function baseArgs(overrides = {}) {
  return {
    facts: IMAGE_FACTS,
    filename: 'IMG_1758_122322.jpeg',
    assetUrl: '/assets/fallen-trees/IMG_1758_122322.jpeg',
    addedBy: 'memex-alice',
    uploadDate: '2026-07-07T12:00:00.000Z',
    tags: ['trees', 'winter'],
    ...overrides,
  };
}

test('buildFrontmatter emits the schema.org contract shape', () => {
  const fm = buildFrontmatter(baseArgs());
  assert.equal(fm.title, 'IMG_1758_122322.jpeg');
  assert.equal(fm.item, 'ni:///sha-256;q80B');
  assert.equal(fm['schema:sha256'], 'abc123');
  assert.equal(fm['schema:contentUrl'], '/assets/fallen-trees/IMG_1758_122322.jpeg');
  assert.equal(fm['schema:encodingFormat'], 'image/jpeg');
  assert.equal(fm['schema:contentSize'], 3243488);
  assert.equal(fm['schema:width'], 4032);
  assert.equal(fm['schema:height'], 3024);
  assert.equal(fm['schema:uploadDate'], '2026-07-07T12:00:00.000Z');
  assert.equal(fm['memex:addedBy'], 'memex-alice');
  assert.deepEqual(fm.tags, ['trees', 'winter']);
});

test('buildFrontmatter sets schema:image only for image media', () => {
  const image = buildFrontmatter(baseArgs());
  assert.equal(image['schema:image'], '/assets/fallen-trees/IMG_1758_122322.jpeg');

  const pdf = buildFrontmatter(baseArgs({
    facts: { hex: 'd0c', ni: 'ni:///sha-256;zz', mimetype: 'application/pdf', byteSize: 100 },
    filename: 'report.pdf',
    assetUrl: '/assets/docs/report.pdf',
  }));
  assert.equal('schema:image' in pdf, false);
  assert.equal('schema:width' in pdf, false);
  assert.equal('schema:height' in pdf, false);
});

test('buildFrontmatter includes schema:dateCreated only when provided', () => {
  assert.equal('schema:dateCreated' in buildFrontmatter(baseArgs()), false);
  const dated = buildFrontmatter(baseArgs({ dateCreated: '2022-12-23' }));
  assert.equal(dated['schema:dateCreated'], '2022-12-23');
});

test('buildFrontmatter drops make-gals fields (layout/permalink/gallery/categories)', () => {
  const fm = buildFrontmatter(baseArgs());
  for (const dropped of ['layout', 'permalink', 'gallery', 'categories', 'mediaType']) {
    assert.equal(dropped in fm, false, `${dropped} must not be stored`);
  }
});

test('serializeRecord round-trips prefixed keys through YAML', () => {
  const fm = buildFrontmatter(baseArgs());
  const md = serializeRecord(fm, '');
  assert.match(md, /^---\n/);
  const parsed = yaml.load(md.split('---')[1]);
  assert.equal(parsed['schema:sha256'], 'abc123');
  assert.equal(parsed['memex:addedBy'], 'memex-alice');
  assert.equal(parsed.item, 'ni:///sha-256;q80B');
});

test('serializeRecord appends a body after the frontmatter', () => {
  const md = serializeRecord({ title: 'x' }, 'Curator prose with a [[wikilink]].');
  assert.match(md, /---\n\nCurator prose with a \[\[wikilink\]\]\.\n$/);
});
