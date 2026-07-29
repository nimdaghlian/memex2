import { createInterface } from 'node:readline';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import figlet from 'figlet';

import { ok, info, warn, err } from './output.js';

// Interactive wizard — a menu-driven front end launched when `memex` is run with no arguments,
// for the curator who'd rather be guided than remember flags. It is pure orchestration: `ask`
// (a prompt fn), `out` (a writer), and the command runners are all injected, so the flow is
// unit-testable with scripted answers and no real readline.

// Returned by any prompt the curator backed out of — the B) menu choice, or Esc at any prompt.
// Distinct from null, which means EOF: BACK unwinds one level to the menu, null unwinds all the
// way out. Because Esc works everywhere, free-text prompts need no magic escape word, which keeps
// "back" available as an ordinary tag.
export const BACK = Symbol('back');

const BACK_WORDS = new Set(['b', 'back']);

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
  const ask = (question) => {
    if (question) process.stdout.write(question);
    if (buffer.length) return Promise.resolve(buffer.shift());
    if (closed) return Promise.resolve(null);
    return new Promise((res) => waiters.push(res));
  };
  // Resolve whatever prompt is currently waiting with BACK. Wired to Esc by startSession; a no-op
  // when nothing is pending (piped input, where lines arrive faster than prompts consume them).
  ask.cancel = () => {
    const waiter = waiters.shift();
    if (waiter) waiter(BACK);
  };
  return ask;
}

export function parseTags(input) {
  return String(input ?? '').split(',').map(t => t.trim()).filter(Boolean);
}

// Frame lines in a plain-ASCII box (no box-drawing codepoints — this sits under a figlet banner
// and has to survive the same dumb terminals). An optional title is inlaid in the top rule.
export function box(lines, { title = null, indent = '  ' } = {}) {
  const body = (lines ?? []).map(l => String(l));
  const label = title ? `--[ ${title} ]` : '';
  const inner = Math.max(label.length, ...body.map(l => l.length + 2), 2);
  const rows = body.map(l => `|${(' ' + l).padEnd(inner)}|`);
  return [
    `+${label}${'-'.repeat(inner - label.length)}+`,
    ...rows,
    `+${'-'.repeat(inner)}+`,
  ].map(l => indent + l).join('\n') + '\n';
}

// readline completer for a filesystem path: offers the DIRECTORIES under whatever has been typed
// so far. Directories only — every prompt this is wired to wants a Library directory, and hiding
// the files keeps a big gallery's worth of assets out of the completion list. Hits are full line
// values because readline replaces the whole line with the chosen one.
export function completePath(line, { cwd = process.cwd() } = {}) {
  const typed = String(line ?? '');
  // A trailing slash means "list inside this directory"; otherwise the last segment is a partial.
  const dirPart = typed.endsWith('/') ? typed : dirname(typed) === '.' && !typed.includes('/') ? '' : `${dirname(typed)}/`;
  const partial = typed.endsWith('/') ? '' : basename(typed);
  const searchDir = resolve(cwd, dirPart || '.');

  let names = [];
  try {
    names = readdirSync(searchDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name)
      .sort();
  } catch {
    return [[], typed]; // unreadable/nonexistent prefix — no suggestions, leave the line alone
  }

  const hits = names
    .filter(name => name.startsWith(partial))
    .map(name => `${dirPart}${name}/`);

  // Nothing matched the partial: show the whole directory rather than silently doing nothing.
  return [hits.length ? hits : (partial ? [] : names.map(n => `${dirPart}${n}/`)), typed];
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
  out(box([
    'P) Process a directory',
    'T) Tag a directory',
    'U) Update from peers',
    'V) Verify a directory',
    'C) Create config',
    'H) Help',
    'Q) Quit',
  ], { title: 'Menu' }));
  out('\n');
}

// List the sub-directories of baseDir (the Library, where asset directories live) and let the
// curator pick one — or 0 to type any path, or B to go back. Returns null on EOF, BACK on back.
// `setCompleter` (injected; a no-op under test) turns on tab-completion for the manual path.
export async function pickDirectory({ ask, out, baseDir, cwd, setCompleter = () => {} }) {
  const subdirs = existsSync(baseDir)
    ? readdirSync(baseDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => d.name)
        .sort()
    : [];

  out(box([
    ...subdirs.map((d, i) => `${i + 1}) ${d}`),
    '0) enter a path manually',
    'B) back',
  ], { title: 'Directories' }));
  out('\n');

  while (true) {
    const input = await ask('  Select: ');
    if (input === null || input === BACK) return input;
    const trimmed = input.trim();
    if (BACK_WORDS.has(trimmed.toLowerCase())) return BACK;
    if (trimmed === '0' || trimmed === '') {
      // A manually typed path starts at the LIBRARY ROOT, not the shell's cwd: the wizard is only
      // ever pointed at asset directories, and the picker above it lists that same root. An
      // absolute path still wins, since resolve() ignores the base when given one.
      // Tab-completion is only meaningful for this one prompt, so it is switched on around it and
      // off again — a stray completer on the menu prompt would offer paths for "P".
      setCompleter((line) => completePath(line, { cwd: baseDir }));
      try {
        const path = await ask('  Path (from the Library root; Tab completes, Esc cancels): ');
        if (path === null || path === BACK) return path;
        return resolve(baseDir, path.trim());
      } finally {
        setCompleter(null);
      }
    }
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= 1 && n <= subdirs.length) {
      return join(baseDir, subdirs[n - 1]);
    }
    err(`Enter a number 0–${subdirs.length}, or B to go back.`);
  }
}

async function requiredInput(ask, prompt, message) {
  while (true) {
    const value = await ask(prompt);
    if (value === null || value === BACK) return value;
    if (value.trim()) return value.trim();
    err(message);
  }
}

// True when a sub-flow ended without a value — EOF or an explicit back-out. Either way the caller
// returns to the menu; only EOF also ends the session, which the menu loop's own ask() catches.
const done = (v) => v === null || v === BACK;

async function doProcess({ ask, out, cwd, libraryDir, commands, setCompleter }) {
  const dir = await pickDirectory({ ask, out, baseDir: libraryDir, cwd, setCompleter });
  if (done(dir)) return;
  const tags = await ask('  Tags to seed (comma-separated, optional; Esc cancels): ');
  if (done(tags)) return;
  commands.process({ dir, tags: parseTags(tags) });
}

async function doTag({ ask, out, cwd, libraryDir, commands, setCompleter }) {
  const dir = await pickDirectory({ ask, out, baseDir: libraryDir, cwd, setCompleter });
  if (done(dir)) return;
  // No escape word here on purpose — Esc covers it, so "back" stays usable as an ordinary tag.
  const answer = await ask('  Tags to add (comma-separated; Esc cancels): ');
  if (done(answer)) return;
  const tags = parseTags(answer);
  if (tags.length === 0) {
    warn('at least one tag is required — nothing added');
    return;
  }
  commands.tag({ dir, tags });
}

async function doVerify({ ask, out, cwd, libraryDir, commands, setCompleter }) {
  const dir = await pickDirectory({ ask, out, baseDir: libraryDir, cwd, setCompleter });
  if (done(dir)) return;
  commands.verify({ dir });
}

async function doCreateConfig({ ask, commands }) {
  const memexId = await requiredInput(ask, '  memexId (this machine\'s identity; Esc cancels): ', 'memexId is required.');
  if (done(memexId)) return;
  const curator = await ask('  Curator name (optional): ');
  if (done(curator)) return;
  const outDir = await ask('  Output dir for Records/Collections (default: ./site): ');
  if (done(outDir)) return;
  const library = await ask('  Library root (default: ./library): ');
  if (done(library)) return;
  commands.createConfig({
    memexId,
    curatorName: curator.trim() || undefined,
    out: outDir.trim() || './site',
    library: library.trim() || './library',
  });
}

export async function run({ ask, out, cwd = process.cwd(), libraryDir, commands, helpFn, memexId, curatorName, setCompleter = () => {} }) {
  const base = libraryDir ?? cwd;

  sessionHeader({ out, memexId, curatorName });

  while (true) {
    printMenu(out);
    const answer = await ask('> ');
    if (answer === null) return; // EOF — nothing more to read
    if (answer === BACK) continue; // Esc at the top level: there is nowhere to go back to
    const choice = answer.trim().toUpperCase();
    try {
      switch (choice) {
        case 'P': await doProcess({ ask, out, cwd, libraryDir: base, commands, setCompleter }); break;
        case 'T': await doTag({ ask, out, cwd, libraryDir: base, commands, setCompleter }); break;
        case 'U': commands.update({}); break;
        case 'V': await doVerify({ ask, out, cwd, libraryDir: base, commands, setCompleter }); break;
        case 'C': await doCreateConfig({ ask, commands }); break;
        case 'H': if (helpFn) helpFn(); else commands.help({}); out('\n'); break;
        case 'Q': return;
        default: out('  Please enter P, T, U, V, C, H, or Q.\n');
      }
    } catch (e) {
      err(e.message);
    }
  }
}

// Convenience for bin: build a readline-backed wizard session. Kept thin so the tested `run`
// carries the logic. The completer is indirected through a mutable slot because readline fixes
// its completer at construction, while we only want completion during the path prompt.
export function startSession(opts) {
  let active = null;
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => (active ? active(line) : [[], line]),
  });
  const ask = createAsk(rl);

  // Esc backs out of the pending prompt. readline emits keypress on the input stream whenever the
  // interface is in terminal mode; arrow keys and other escape SEQUENCES are parsed into their own
  // key names, so a bare 'escape' really is the Esc key. Piped stdin isn't a terminal, so this
  // simply never fires there — the B) menu choice remains the scriptable way back.
  const onKeypress = (_ch, key) => {
    if (key?.name !== 'escape' || key.ctrl || key.meta) return;
    rl.write(null, { ctrl: true, name: 'u' }); // discard whatever was half-typed
    process.stdout.write('\n');
    ask.cancel();
  };
  if (rl.terminal) process.stdin.on('keypress', onKeypress);

  return run({ ask, out: (s) => process.stdout.write(s), setCompleter: (fn) => { active = fn; }, ...opts })
    .finally(() => {
      process.stdin.off('keypress', onKeypress);
      rl.close();
    });
}

export { ok, info };
