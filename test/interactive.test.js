import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run, parseTags, pickDirectory, sessionHeader, box, completePath, createAsk, BACK } from '../src/interactive.js';

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

test('quit (Q) returns without dispatching anything', async () => {
  const commands = spyCommands();
  await run({ ask: scriptedAsk(['Q']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
  assert.deepEqual(commands.calls, []);
});

test('menu choices are case-insensitive and tolerate surrounding space', async () => {
  const commands = spyCommands();
  await run({ ask: scriptedAsk([' u ', 'q']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
  assert.equal(commands.calls.length, 1);
  assert.equal(commands.calls[0].name, 'update');
});

test('an invalid menu choice reprompts, then quits', async () => {
  const commands = spyCommands();
  await run({ ask: scriptedAsk(['99', 'Q']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
  assert.deepEqual(commands.calls, []);
});

test('process flow picks a library subdir, gathers tags, and dispatches process', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-wiz-'));
  mkdirSync(join(lib, 'photos'));
  const commands = spyCommands();

  // menu:P process → pick:1 (photos) → tags → menu:Q quit
  await run({ ask: scriptedAsk(['P', '1', 'trees, winter', 'Q']), out: noop, cwd: lib, libraryDir: lib, commands });

  assert.equal(commands.calls.length, 1);
  assert.equal(commands.calls[0].name, 'process');
  assert.deepEqual(commands.calls[0].arg, { dir: join(lib, 'photos'), tags: ['trees', 'winter'] });
});

test('update flow dispatches update with no further input', async () => {
  const commands = spyCommands();
  await run({ ask: scriptedAsk(['U', 'Q']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
  assert.equal(commands.calls.length, 1);
  assert.equal(commands.calls[0].name, 'update');
});

test('tag flow requires at least one tag — a blank entry skips without dispatching', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-wiz-'));
  mkdirSync(join(lib, 'photos'));
  const commands = spyCommands();

  await run({ ask: scriptedAsk(['T', '1', '', 'Q']), out: noop, cwd: lib, libraryDir: lib, commands });
  assert.deepEqual(commands.calls, []);
});

test('create-config flow gathers memexId/curatorName/out/library and dispatches createConfig', async () => {
  const commands = spyCommands();
  // menu:C → memexId → curatorName → out (blank=default) → library (blank=default) → menu:Q
  await run({ ask: scriptedAsk(['C', 'memex-nim', 'Nim', '', '', 'Q']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });

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
  await run({ ask: scriptedAsk(['Q']), out: (s) => out.push(s), memexId: 'm', curatorName: 'Nim', cwd: '/tmp', libraryDir: '/tmp', commands: spyCommands() });
  const greetings = out.join('').match(/Hi Nim/g) ?? [];
  assert.equal(greetings.length, 1);
});

test('a command that throws does not crash the menu loop', async () => {
  const commands = spyCommands();
  commands.update = () => { throw new Error('memexId not set'); };
  // update throws, loop continues to quit — run resolves normally.
  await run({ ask: scriptedAsk(['U', 'Q']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
});

test('pickDirectory returns a chosen library subdirectory', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  mkdirSync(join(lib, 'alpha'));
  mkdirSync(join(lib, 'beta'));

  const chosen = await pickDirectory({ ask: scriptedAsk(['2']), out: noop, baseDir: lib, cwd: lib });
  assert.equal(chosen, join(lib, 'beta')); // sorted: alpha=1, beta=2
});

test('pickDirectory option 0 resolves a manually entered path against the LIBRARY root', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  const chosen = await pickDirectory({ ask: scriptedAsk(['0', 'some/where']), out: noop, baseDir: lib, cwd: '/root' });
  assert.equal(chosen, join(lib, 'some/where'), 'a relative path is Library-relative, not cwd-relative');
});

test('pickDirectory still honours an absolute manually entered path', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  const chosen = await pickDirectory({ ask: scriptedAsk(['0', '/elsewhere/gallery']), out: noop, baseDir: lib, cwd: '/root' });
  assert.equal(chosen, '/elsewhere/gallery');
});

test('pickDirectory completes against the Library root, not the cwd', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  mkdirSync(join(lib, 'birds'));
  let completer;
  await pickDirectory({
    ask: scriptedAsk(['0', 'birds']),
    out: noop,
    baseDir: lib,
    cwd: '/root',
    setCompleter: (fn) => { if (fn) completer = fn; },
  });
  assert.deepEqual(completer('bir')[0], ['birds/']);
});

// --- back ---------------------------------------------------------------------------------

test('pickDirectory returns BACK when the curator chooses B', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  mkdirSync(join(lib, 'alpha'));
  assert.equal(await pickDirectory({ ask: scriptedAsk(['B']), out: noop, baseDir: lib, cwd: lib }), BACK);
});

test('pickDirectory returns BACK when Esc cancels the manual-path prompt', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  // Esc surfaces as BACK straight from ask() — see createAsk().cancel.
  assert.equal(await pickDirectory({ ask: scriptedAsk(['0', BACK]), out: noop, baseDir: lib, cwd: lib }), BACK);
});

test('Esc cancels the manual-path prompt without treating "back" as a path', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  const chosen = await pickDirectory({ ask: scriptedAsk(['0', 'back']), out: noop, baseDir: lib, cwd: lib });
  assert.equal(chosen, join(lib, 'back'), 'free-text prompts have no escape word — Esc does that job');
});

test('backing out of a directory pick returns to the menu without dispatching', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-wiz-'));
  mkdirSync(join(lib, 'photos'));
  const commands = spyCommands();

  // P → B (back to menu) → Q. If back leaked through, process would be dispatched.
  await run({ ask: scriptedAsk(['P', 'B', 'Q']), out: noop, cwd: lib, libraryDir: lib, commands });
  assert.deepEqual(commands.calls, []);
});

test('Esc at the tags prompt abandons the process flow', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-wiz-'));
  mkdirSync(join(lib, 'photos'));
  const commands = spyCommands();

  await run({ ask: scriptedAsk(['P', '1', BACK, 'Q']), out: noop, cwd: lib, libraryDir: lib, commands });
  assert.deepEqual(commands.calls, []);
});

test('"back" is an ordinary tag now that Esc does the cancelling', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-wiz-'));
  mkdirSync(join(lib, 'photos'));
  const commands = spyCommands();

  await run({ ask: scriptedAsk(['T', '1', 'back, forth', 'Q']), out: noop, cwd: lib, libraryDir: lib, commands });
  assert.equal(commands.calls.length, 1);
  assert.deepEqual(commands.calls[0].arg.tags, ['back', 'forth']);
});

test('Esc mid create-config writes nothing', async () => {
  const commands = spyCommands();
  await run({ ask: scriptedAsk(['C', 'memex-nim', BACK, 'Q']), out: noop, cwd: '/tmp', libraryDir: '/tmp', commands });
  assert.deepEqual(commands.calls, []);
});

test('Esc at the top-level menu redraws it instead of exiting', async () => {
  const commands = spyCommands();
  const out = [];
  await run({ ask: scriptedAsk([BACK, 'Q']), out: (s) => out.push(s), cwd: '/tmp', libraryDir: '/tmp', commands });
  const menus = out.join('').match(/\+--\[ Menu \]/g) ?? [];
  assert.equal(menus.length, 2, 'menu drawn once before Esc and once after');
});

test('createAsk exposes cancel(), which resolves the pending prompt as BACK', async () => {
  const listeners = {};
  const rl = { on: (event, fn) => { listeners[event] = fn; } };
  const ask = createAsk(rl);
  const pending = ask();
  ask.cancel();
  assert.equal(await pending, BACK);
});

test('cancel() with nothing pending is a no-op, and does not swallow the next line', async () => {
  const listeners = {};
  const rl = { on: (event, fn) => { listeners[event] = fn; } };
  const ask = createAsk(rl);
  ask.cancel();
  listeners.line('photos');
  assert.equal(await ask(), 'photos');
});

test('EOF inside a sub-flow ends the session rather than looping', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-wiz-'));
  mkdirSync(join(lib, 'photos'));
  const commands = spyCommands();
  // null from the picker = EOF; the menu's next ask also returns null and run() returns.
  await run({ ask: scriptedAsk(['P', null, null]), out: noop, cwd: lib, libraryDir: lib, commands });
  assert.deepEqual(commands.calls, []);
});

// --- box ----------------------------------------------------------------------------------

test('box frames every line to a common width', () => {
  const lines = box(['short', 'a much longer line'], { indent: '' }).split('\n').filter(Boolean);
  const widths = new Set(lines.map(l => l.length));
  assert.equal(widths.size, 1, `expected one width, got ${[...widths]}`);
  assert.match(lines[0], /^\+-+\+$/);
  assert.match(lines.at(-1), /^\+-+\+$/);
  assert.match(lines[1], /^\| short +\|$/);
});

test('box inlays a title in the top rule without changing the frame width', () => {
  const lines = box(['P) Process a directory'], { title: 'Menu', indent: '' }).split('\n').filter(Boolean);
  assert.match(lines[0], /^\+--\[ Menu \]-+\+$/);
  assert.equal(lines[0].length, lines.at(-1).length);
});

test('box survives a title longer than its content', () => {
  const lines = box(['x'], { title: 'A very long title indeed', indent: '' }).split('\n').filter(Boolean);
  const widths = new Set(lines.map(l => l.length));
  assert.equal(widths.size, 1);
});

test('the menu is drawn inside a box', async () => {
  const out = [];
  await run({ ask: scriptedAsk(['Q']), out: (s) => out.push(s), cwd: '/tmp', libraryDir: '/tmp', commands: spyCommands() });
  const text = out.join('');
  assert.match(text, /\+--\[ Menu \]/);
  assert.match(text, /\|\s+P\) Process a directory\s+\|/);
});

// --- path completion ----------------------------------------------------------------------

test('completePath offers directories matching the typed prefix', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-comp-'));
  mkdirSync(join(root, 'gallery-one'));
  mkdirSync(join(root, 'gallery-two'));
  mkdirSync(join(root, 'other'));

  const [hits, line] = completePath('gall', { cwd: root });
  assert.deepEqual(hits, ['gallery-one/', 'gallery-two/']);
  assert.equal(line, 'gall', 'readline needs the original line back');
});

test('completePath descends into a directory once the separator is typed', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-comp-'));
  mkdirSync(join(root, 'library', 'birds'), { recursive: true });
  mkdirSync(join(root, 'library', 'boats'), { recursive: true });

  const [hits] = completePath('library/b', { cwd: root });
  assert.deepEqual(hits, ['library/birds/', 'library/boats/']);
});

test('completePath lists everything when the segment is empty', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-comp-'));
  mkdirSync(join(root, 'library', 'birds'), { recursive: true });

  const [hits] = completePath('library/', { cwd: root });
  assert.deepEqual(hits, ['library/birds/']);
});

test('completePath omits files and dotfiles — a Library path is always a directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-comp-'));
  mkdirSync(join(root, 'birds'));
  mkdirSync(join(root, '.hidden'));
  writeFileSync(join(root, 'birds.jpeg'), 'x');

  const [hits] = completePath('', { cwd: root });
  assert.deepEqual(hits, ['birds/']);
});

test('completePath returns no hits for an unreadable prefix instead of throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'memex-comp-'));
  assert.deepEqual(completePath('nope/deeper/', { cwd: root }), [[], 'nope/deeper/']);
});

test('pickDirectory turns completion on only for the manual-path prompt', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'memex-pick-'));
  const states = [];
  await pickDirectory({
    ask: scriptedAsk(['0', 'some/where']),
    out: noop,
    baseDir: lib,
    cwd: '/root',
    setCompleter: (fn) => states.push(fn ? 'on' : 'off'),
  });
  assert.deepEqual(states, ['on', 'off']);
});
