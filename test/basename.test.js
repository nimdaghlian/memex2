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

test('distinct-content assets that slug identically get deterministic increment suffixes', () => {
  const out = allocateBasenames([
    { filename: 'Photo 1.jpeg', hex: 'bbbb' }, // slug "photo-1"
    { filename: 'photo-1.png', hex: 'aaaa' },  // slug "photo-1"
  ]);
  const nameFor = (f) => out.find(o => o.filename === f).basename;
  // sorted by hash ascending: aaaa = rank 0 → base, bbbb = rank 1 → -2
  assert.equal(nameFor('photo-1.png'), 'photo-1');
  assert.equal(nameFor('Photo 1.jpeg'), 'photo-1-2');
  assert.equal(out.every(o => o.collision), true);
});

test('increment assignment is stable regardless of input order', () => {
  const forward = allocateBasenames([
    { filename: 'Photo 1.jpeg', hex: 'bbbb' }, { filename: 'photo-1.png', hex: 'aaaa' },
  ]);
  const reverse = allocateBasenames([
    { filename: 'photo-1.png', hex: 'aaaa' }, { filename: 'Photo 1.jpeg', hex: 'bbbb' },
  ]);
  const nameFor = (r, f) => r.find(o => o.filename === f).basename;
  assert.equal(nameFor(forward, 'photo-1.png'), 'photo-1');
  assert.equal(nameFor(reverse, 'photo-1.png'), 'photo-1'); // unchanged by order
  assert.equal(nameFor(reverse, 'Photo 1.jpeg'), 'photo-1-2');
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
