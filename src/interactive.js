import { createInterface } from 'node:readline';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import figlet from 'figlet';

import { ok, info, warn, err } from './output.js';

// Interactive wizard — a menu-driven front end launched when `memex` is run with no arguments,
// for the curator who'd rather be guided than remember flags. It is pure orchestration: `ask`
// (a prompt fn), `out` (a writer), and the command runners are all injected, so the flow is
// unit-testable with scripted answers and no real readline.

// Build a promise-returning question fn over a readline interface. Lines are BUFFERED into a
// queue rather than read with rl.question — with piped (non-TTY) stdin the whole input arrives as
// a burst of 'line' events, and rl.question would drop every line after the first. On EOF, a
// pending/next ask resolves to null so callers can unwind instead of hanging.
export function createAsk(rl) {
  const buffer = [];
  const waiters = [];
  let closed = false;
  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else buffer.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  return (question) => {
    if (question) process.stdout.write(question);
    if (buffer.length) return Promise.resolve(buffer.shift());
    if (closed) return Promise.resolve(null);
    return new Promise((res) => waiters.push(res));
  };
}

export function parseTags(input) {
  return String(input ?? '').split(',').map(t => t.trim()).filter(Boolean);
}

// Printed once when the wizard opens: the memex name in big ASCII letters, then a greeting.
// Falls back to the tool name before a config exists; the greeting is skipped if no curator set.
export function sessionHeader({ out, memexId, curatorName }) {
  out('\n');
  out(figlet.textSync(memexId || 'memex', { font: 'Slant Relief' }) + '\n');
  if (curatorName) out(`\n  Hi ${curatorName}!\n`);
}

function printMenu(out) {
  out('\n');
  out('  1) Process a directory\n');
  out('  2) Tag a directory\n');
  out('  3) Update from peers\n');
  out('  4) Verify a directory\n');
  out('  5) Create config\n');
  out('  6) Help\n');
  out('  7) Quit\n\n');
}

// List the sub-directories of baseDir (the Library, where asset directories live) and let the
// curator pick one — or choose 0 to type any path. Returns null on EOF.
export async function pickDirectory({ ask, out, baseDir, cwd }) {
  const subdirs = existsSync(baseDir)
    ? readdirSync(baseDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => d.name)
        .sort()
    : [];

  subdirs.forEach((d, i) => out(`  ${i + 1}) ${d}\n`));
  out('  0) enter a path manually\n\n');

  while (true) {
    const input = await ask('  Select: ');
    if (input === null) return null;
    const trimmed = input.trim();
    if (trimmed === '0' || trimmed === '') {
      const path = await ask('  Path: ');
      return path === null ? null : resolve(cwd, path.trim());
    }
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= 1 && n <= subdirs.length) {
      return join(baseDir, subdirs[n - 1]);
    }
    err(`Enter a number 0–${subdirs.length}.`);
  }
}

async function requiredInput(ask, prompt, message) {
  while (true) {
    const value = await ask(prompt);
    if (value === null) return null;
    if (value.trim()) return value.trim();
    err(message);
  }
}

async function doProcess({ ask, out, cwd, libraryDir, commands }) {
  const dir = await pickDirectory({ ask, out, baseDir: libraryDir, cwd });
  if (dir === null) return;
  const tags = parseTags(await ask('  Tags to seed (comma-separated, optional): '));
  commands.process({ dir, tags });
}

async function doTag({ ask, out, cwd, libraryDir, commands }) {
  const dir = await pickDirectory({ ask, out, baseDir: libraryDir, cwd });
  if (dir === null) return;
  const tags = parseTags(await ask('  Tags to add (comma-separated): '));
  if (tags.length === 0) {
    warn('at least one tag is required — nothing added');
    return;
  }
  commands.tag({ dir, tags });
}

async function doVerify({ ask, out, cwd, libraryDir, commands }) {
  const dir = await pickDirectory({ ask, out, baseDir: libraryDir, cwd });
  if (dir === null) return;
  commands.verify({ dir });
}

async function doCreateConfig({ ask, commands }) {
  const memexId = await requiredInput(ask, '  memexId (this machine\'s identity): ', 'memexId is required.');
  if (memexId === null) return;
  const curatorName = ((await ask('  Curator name (optional): ')) ?? '').trim() || undefined;
  const out = ((await ask('  Output dir for Records/Collections (default: ./site): ')) ?? '').trim() || './site';
  const library = ((await ask('  Library root (default: ./library): ')) ?? '').trim() || './library';
  commands.createConfig({ memexId, curatorName, out, library });
}

export async function run({ ask, out, cwd = process.cwd(), libraryDir, commands, helpFn, memexId, curatorName }) {
  const base = libraryDir ?? cwd;

  sessionHeader({ out, memexId, curatorName });

  while (true) {
    printMenu(out);
    const answer = await ask('> ');
    if (answer === null) return; // EOF — nothing more to read
    const choice = answer.trim();
    try {
      switch (choice) {
        case '1': await doProcess({ ask, out, cwd, libraryDir: base, commands }); break;
        case '2': await doTag({ ask, out, cwd, libraryDir: base, commands }); break;
        case '3': commands.update({}); break;
        case '4': await doVerify({ ask, out, cwd, libraryDir: base, commands }); break;
        case '5': await doCreateConfig({ ask, commands }); break;
        case '6': if (helpFn) helpFn(); else commands.help({}); out('\n'); break;
        case '7': return;
        default: out('  Please enter 1–7.\n');
      }
    } catch (e) {
      err(e.message);
    }
  }
}

// Convenience for bin: build a readline-backed wizard session. Kept thin so the tested `run`
// carries the logic.
export function startSession(opts) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = createAsk(rl);
  return run({ ask, out: (s) => process.stdout.write(s), ...opts })
    .finally(() => rl.close());
}

export { ok, info };
