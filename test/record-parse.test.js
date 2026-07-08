import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serializeRecord, parseRecord, mergeTags } from '../src/record.js';

test('parseRecord splits frontmatter from body and round-trips serializeRecord', () => {
  const fm = { title: 'x', 'schema:sha256': 'abc', tags: ['a'] };
  const body = 'Curator prose with a [[wikilink]].';
  const parsed = parseRecord(serializeRecord(fm, body));

  assert.deepEqual(parsed.frontmatter, fm);
  assert.equal(parsed.body, body);
});

test('parseRecord returns an empty body for a frontmatter-only Record', () => {
  const parsed = parseRecord(serializeRecord({ title: 'x' }, ''));
  assert.equal(parsed.body, '');
});

test('parseRecord preserves a multi-line body verbatim', () => {
  const body = 'Line one.\n\n- [[a]]\n- [[b]]';
  const parsed = parseRecord(serializeRecord({ title: 'x' }, body));
  assert.equal(parsed.body, body);
});

test('mergeTags appends new tags and de-duplicates, preserving order', () => {
  assert.deepEqual(mergeTags(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(mergeTags([], ['x']), ['x']);
  assert.deepEqual(mergeTags(['a'], []), ['a']);
});
