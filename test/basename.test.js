import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slug, allocateBasenames } from '../src/basename.js';

test('slug lowercases and collapses non-alphanumerics', () => {
  assert.equal(slug('IMG_1758_122322'), 'img-1758-122322');
  assert.equal(slug('Fallen Trees (2023)'), 'fallen-trees-2023');
  assert.equal(slug('--edge--'), 'edge');
});

test('allocateBasenames derives a stable basename per asset', () => {
  const assets = [
    { filename: 'IMG_1758.jpeg', hex: 'aaaa1111' },
    { filename: 'belmont-is-closed.jpeg', hex: 'bbbb2222' },
  ];
  const out = allocateBasenames(assets);
  assert.equal(out[0].basename, 'img-1758');
  assert.equal(out[1].basename, 'belmont-is-closed');
  assert.equal(out[0].collision, false);
});

test('allocateBasenames is deterministic and order-independent', () => {
  const a = allocateBasenames([
    { filename: 'one.jpeg', hex: '1111' },
    { filename: 'two.jpeg', hex: '2222' },
  ]);
  const b = allocateBasenames([
    { filename: 'two.jpeg', hex: '2222' },
    { filename: 'one.jpeg', hex: '1111' },
  ]);
  assert.equal(a.find(x => x.filename === 'one.jpeg').basename, 'one');
  assert.equal(b.find(x => x.filename === 'one.jpeg').basename, 'one');
});

test('distinct-content assets that slug identically are disambiguated by hash suffix', () => {
  const out = allocateBasenames([
    { filename: 'photo (1).jpeg', hex: 'deadbeef00' },
    { filename: 'photo-1.jpeg', hex: 'cafef00d11' },
  ]);
  // Both slug to "photo-1" but differ in content — no silent overwrite.
  assert.notEqual(out[0].basename, out[1].basename);
  assert.equal(out[0].basename, 'photo-1-deadbeef');
  assert.equal(out[1].basename, 'photo-1-cafef00d');
  assert.equal(out[0].collision, true);
  assert.equal(out[1].collision, true);
});

test('identical-content duplicates share one basename (dedup by hash)', () => {
  const out = allocateBasenames([
    { filename: 'a.jpeg', hex: 'samehash' },
    { filename: 'a-copy.jpeg', hex: 'samehash' },
  ]);
  // Different filenames, same bytes → same Item. Different slugs, so no collision suffix.
  assert.equal(out[0].basename, 'a');
  assert.equal(out[1].basename, 'a-copy');
  assert.equal(out[0].collision, false);
});
