import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractDate } from '../src/date.js';

test('extractDate parses a trailing MMDDYY pattern into ISO date', () => {
  assert.equal(extractDate('IMG_1758_122322.jpeg'), '2022-12-23');
  assert.equal(extractDate('belmont-is-closed_011824.jpeg'), '2024-01-18');
});

test('extractDate returns null when no valid date pattern is present', () => {
  assert.equal(extractDate('photo.jpeg'), null);
  assert.equal(extractDate('IMG_1758_999999.jpeg'), null); // invalid month
});
