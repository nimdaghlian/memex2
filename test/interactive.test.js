import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run, parseTags, pickDirectory, sessionHeader } from '../src/interactive.js';

// A scripted `ask`: returns queued answers in order. Throws if it runs dry (catches a wizard
// that prompts more than the test scripted — usually a menu that never quit).
function scriptedAsk(answers) {
  const queue = [...answers];
  return async () => {
    if (queue.length === 0) throw new Error('ask() called with no scripted answer left');
    return queue.shift();
  };
}

function spyCommands() {
  const calls = [];
  const make = (name) => (arg) => { calls.push({ name, arg }); };
  return {
    calls,
    process: make('process'),
    tag: make('tag'),
    update: make('update'),
    verify: make('verify'),
    createConfig: make('createConfig'),
    help: make('help'),
  };
}

const noop = () => {};

test('parseTags splits a comma list, trimming and dropping blanks', () => {
  assert.deepEqual(parseTags('trees, winter ,, oak'), ['trees', 'winter', 'oak']);
  assert.deepEqual(parseTags('   '), []);
  assert.deepEqual(parseTags(''), []);
});

test('quit (menu 7) returns without dispatching anything', async () => {
  const commands = spyCommands();
  await run({ ask: scriptedAsk(['7']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
  assert.deepEqual(commands.calls, []);
});

test('an invalid menu choice reprompts, then quits', async () => {
  const commands = spyCommands();
  await run({ ask: scriptedAsk(['99', '7']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
  assert.deepEqual(commands.calls, []);
});

test('process flow picks a library subdir, gathers tags, and dispatches process', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-wiz-'));
  mkdirSync(join(lib, 'photos'));
  const commands = spyCommands();

  // menu:1 process → pick:1 (photos) → tags → menu:7 quit
  await run({ ask: scriptedAsk(['1', '1', 'trees, winter', '7']), out: noop, cwd: lib, libraryDir: lib, commands });

  assert.equal(commands.calls.length, 1);
  assert.equal(commands.calls[0].name, 'process');
  assert.deepEqual(commands.calls[0].arg, { dir: join(lib, 'photos'), tags: ['trees', 'winter'] });
});

test('update flow dispatches update with no further input', async () => {
  const commands = spyCommands();
  await run({ ask: scriptedAsk(['3', '7']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
  assert.equal(commands.calls.length, 1);
  assert.equal(commands.calls[0].name, 'update');
});

test('tag flow requires at least one tag — a blank entry skips without dispatching', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-wiz-'));
  mkdirSync(join(lib, 'photos'));
  const commands = spyCommands();

  await run({ ask: scriptedAsk(['2', '1', '', '7']), out: noop, cwd: lib, libraryDir: lib, commands });
  assert.deepEqual(commands.calls, []);
});

test('create-config flow gathers memexId/curatorName/out/library and dispatches createConfig', async () => {
  const commands = spyCommands();
  // menu:5 → memexId → curatorName → out (blank=default) → library (blank=default) → menu:7
  await run({ ask: scriptedAsk(['5', 'memex-nim', 'Nim', '', '', '7']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });

  assert.equal(commands.calls.length, 1);
  assert.equal(commands.calls[0].name, 'createConfig');
  assert.deepEqual(commands.calls[0].arg, { memexId: 'memex-nim', curatorName: 'Nim', out: './site', library: './library' });
});

test('sessionHeader banners the memex name and greets the curator', () => {
  const out = [];
  sessionHeader({ out: (s) => out.push(s), memexId: 'memexnim', curatorName: 'Nim' });
  const text = out.join('');
  assert.match(text, /Hi Nim/);
  assert.ok(text.split('\n').length > 3, 'expected a multi-line ASCII banner');
});

test('sessionHeader omits the greeting when no curator name is set', () => {
  const out = [];
  sessionHeader({ out: (s) => out.push(s), memexId: 'memexnim' });
  assert.doesNotMatch(out.join(''), /Hi /);
});

test('opening the wizard prints the header once, before the menu loop', async () => {
  const out = [];
  await run({ ask: scriptedAsk(['7']), out: (s) => out.push(s), memexId: 'm', curatorName: 'Nim', cwd: '/tmp', libraryDir: '/tmp', commands: spyCommands() });
  const greetings = out.join('').match(/Hi Nim/g) ?? [];
  assert.equal(greetings.length, 1);
});

test('a command that throws does not crash the menu loop', async () => {
  const commands = spyCommands();
  commands.update = () => { throw new Error('memexId not set'); };
  // update throws, loop continues to quit — run resolves normally.
  await run({ ask: scriptedAsk(['3', '7']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
});

test('pickDirectory returns a chosen library subdirectory', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  mkdirSync(join(lib, 'alpha'));
  mkdirSync(join(lib, 'beta'));

  const chosen = await pickDirectory({ ask: scriptedAsk(['2']), out: noop, baseDir: lib, cwd: lib });
  assert.equal(chosen, join(lib, 'beta')); // sorted: alpha=1, beta=2
});

test('pickDirectory option 0 accepts a manually entered path', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  const chosen = await pickDirectory({ ask: scriptedAsk(['0', 'some/where']), out: noop, baseDir: lib, cwd: '/root' });
  assert.equal(chosen, '/root/some/where');
});
