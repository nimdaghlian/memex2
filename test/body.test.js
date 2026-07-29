import { test } from 'node:test';
import assert from 'node:assert/strict';

import { membersSection, descriptionSection } from '../site/_lib/body.js';

test('membersSection returns only the link dump below the rule', () => {
  const body = 'Some prose with a [[sibling]] link.\n\n---\n\n- [[a]]\n- [[b]]\n';
  const members = membersSection(body);
  assert.equal(members.includes('[[sibling]]'), false);
  assert.match(members, /\[\[a\]\]/);
  assert.match(members, /\[\[b\]\]/);
});

test('membersSection treats a rule-less body as all membership (pre-rule Collections)', () => {
  assert.match(membersSection('- [[a]]\n- [[b]]\n'), /\[\[a\]\]/);
});

test('membersSection ignores front matter fences when finding the rule', () => {
  const raw = '---\ntitle: x\ntags:\n  - t\n---\n\nProse.\n\n---\n\n- [[a]]\n';
  const members = membersSection(raw);
  assert.equal(members.includes('Prose.'), false);
  assert.match(members, /\[\[a\]\]/);
});

test('descriptionSection returns rendered html above the <hr>, minus editor comments', () => {
  const html = '<!-- hint -->\n<p>A gallery.</p>\n<hr>\n<ul><li>[[a]]</li></ul>';
  assert.equal(descriptionSection(html), '<p>A gallery.</p>');
});

test('descriptionSection is empty when the description half holds only a comment', () => {
  assert.equal(descriptionSection('<!-- hint -->\n<hr>\n<ul><li>[[a]]</li></ul>'), '');
});

test('descriptionSection is empty when there is no rule at all', () => {
  assert.equal(descriptionSection('<ul><li>[[a]]</li></ul>'), '');
});
