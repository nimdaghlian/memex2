import { test } from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';

import { buildCollection } from '../src/collection.js';

test('buildCollection renders a Record whose body is [[wikilinks]] to each member', () => {
  const md = buildCollection({ name: 'Fallen Trees', members: ['img-1758', 'belmont'], addedBy: 'memex-alice', tags: ['trees'] });

  const fm = yaml.load(md.split('---')[1]);
  assert.equal(fm.title, 'Fallen Trees');
  assert.deepEqual(fm.tags, ['trees']);

  assert.match(md, /- \[\[img-1758\]\]/);
  assert.match(md, /- \[\[belmont\]\]/);
});

test('buildCollection separates a description area from the membership dump with a rule', () => {
  const md = buildCollection({ name: 'Fallen Trees', members: ['a', 'b'], addedBy: 'me' });
  const body = md.split(/^---$/m).slice(2).join('---');
  const [description, members] = body.split(/^---$/m);
  assert.equal(members.includes('[[a]]'), true);
  assert.equal(description.includes('[[a]]'), false);
});

test('buildCollection with no members still produces valid frontmatter', () => {
  const md = buildCollection({ name: 'Empty', members: [], addedBy: 'me' });
  const fm = yaml.load(md.split('---')[1]);
  assert.equal(fm.title, 'Empty');
});

test('buildCollection frontmatter is title + tags only (no prefixed keys)', () => {
  const md = buildCollection({ name: 'Fallen Trees', members: ['a', 'b'], addedBy: 'memex-alice', tags: ['trees'] });
  const fm = yaml.load(md.split('---')[1]);
  assert.equal(fm.title, 'Fallen Trees');
  assert.equal('memex:addedBy' in fm, false);
  assert.deepEqual(fm.tags, ['trees']);
});
