import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWikilinks } from '../site/_lib/wikilinks.js';

const MAP = new Map([['redwoods', '/items/redwoods/'], ['ferns', '/items/ferns/']]);

test('resolves a known wikilink to an anchor', () => {
  const { text, unresolved } = resolveWikilinks('See [[redwoods]].', MAP);
  assert.equal(text, 'See <a href="/items/redwoods/">redwoods</a>.');
  assert.deepEqual(unresolved, []);
});

test('leaves an unknown wikilink and records it', () => {
  const { text, unresolved } = resolveWikilinks('See [[wildfire]].', MAP);
  assert.equal(text, 'See [[wildfire]].');
  assert.deepEqual(unresolved, ['wildfire']);
});

test('resolves multiple links and trims/lowercases the key', () => {
  const { text } = resolveWikilinks('[[ Redwoods ]] and [[ferns]]', MAP);
  assert.equal(text, '<a href="/items/redwoods/">Redwoods</a> and <a href="/items/ferns/">ferns</a>');
});
