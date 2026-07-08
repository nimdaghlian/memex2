#!/usr/bin/env node
import { Command } from 'commander';

import { loadConfig, saveConfig } from '../src/config.js';
import { runProcess } from '../src/commands/process.js';
import { runUpdate } from '../src/commands/update.js';
import { runVerify } from '../src/commands/verify.js';
import { runTag } from '../src/commands/tag.js';
import { startSession } from '../src/interactive.js';
import { ok, info, warn, err } from '../src/output.js';

const program = new Command();

function config(opts) {
  return loadConfig({ configPath: opts.config });
}

// Accumulator for --tag flags. Each value may itself be a comma-separated list, and the flag is
// repeatable, so `--tag a,b --tag c` and `--tag a --tag b` both work.
function collect(value, acc) {
  for (const tag of value.split(',').map(t => t.trim()).filter(Boolean)) acc.push(tag);
  return acc;
}

function requireMemexId(cfg) {
  if (!cfg.memexId) {
    throw new Error(`memexId not set — add "memexId: <your-memex>" to memex.config.yml`);
  }
}

function formatWarning(w) {
  switch (w.type) {
    case 'no-manifest': return `${w.dir}: not processed (no manifest.json) — run \`memex process\``;
    case 'changed': return `${w.path}: bytes changed since last process`;
    case 'renamed': return `${w.from} → ${w.to}: renamed (same bytes)`;
    case 'deleted': return `${w.path}: deleted (still in manifest)`;
    case 'stray': return `${w.path}: untracked asset (not in manifest)`;
    default: return JSON.stringify(w);
  }
}

program
  .name('memex')
  .description('Memex 2.0 — catalog content-addressed assets into Records, Collections, and an in-directory manifest.');

program
  .command('process')
  .description('Hash a directory of assets → write manifest.json, Records, and a baseline Collection')
  .argument('<dir>', 'Asset directory to process')
  .option('--out <dir>', 'Record/Collection output dir (overrides config)')
  .option('--config <file>', 'Path to memex.config.yml')
  .option('--overwrite', 'Replace existing Record/Collection .md files', false)
  .option('--no-parse-date', 'Do not derive schema:dateCreated from filenames')
  .option('--tag <tag>', 'Add a tag to every Record + Collection (repeatable)', collect, [])
  .action((dir, opts) => {
    try {
      const cfg = config(opts);
      requireMemexId(cfg);
      const s = runProcess({ dir, out: opts.out ?? cfg.out, memexId: cfg.memexId, overwrite: opts.overwrite, parseDate: opts.parseDate, tags: opts.tag });
      if (s.added.length) info(`added: ${s.added.join(', ')}`);
      ok(`process: ${s.records} record(s), ${s.collection} collection, manifest updated`);
    } catch (e) {
      err(e.message);
      process.exit(1);
    }
  });

program
  .command('update')
  .description("Generate baseline Records for peers' untracked assets across the Library")
  .option('--out <dir>', 'Record/Collection output dir (overrides config)')
  .option('--library <dir>', 'Library root to scan (overrides config)')
  .option('--config <file>', 'Path to memex.config.yml')
  .option('--overwrite', 'Replace existing Record/Collection .md files', false)
  .action((opts) => {
    try {
      const cfg = config(opts);
      requireMemexId(cfg);
      const s = runUpdate({ library: opts.library ?? cfg.library, out: opts.out ?? cfg.out, memexId: cfg.memexId, overwrite: opts.overwrite });
      ok(`update: ${s.records} record(s), ${s.collections} collection(s) from peers`);
    } catch (e) {
      err(e.message);
      process.exit(1);
    }
  });

program
  .command('verify')
  .description('Check a processed directory against its manifest.json (warn-only)')
  .argument('<dir>', 'Processed asset directory to verify')
  .action((dir) => {
    try {
      const r = runVerify({ dir });
      for (const w of r.warnings) warn(formatWarning(w));
      if (r.ok) ok('verify: clean');
      else info(`verify: ${r.warnings.length} warning(s) — non-fatal`);
      // Warn-only: integrity drift never fails the command.
    } catch (e) {
      err(e.message);
      process.exit(1);
    }
  });

program
  .command('tag')
  .description("Add tags to every Record of an already-processed directory")
  .argument('<dir>', 'Processed asset directory whose Records to tag')
  .requiredOption('--tag <tag>', 'Tag to add (repeatable)', collect, [])
  .option('--out <dir>', 'Record/Collection output dir (overrides config)')
  .option('--config <file>', 'Path to memex.config.yml')
  .action((dir, opts) => {
    try {
      const s = runTag({ dir, out: opts.out ?? config(opts).out, tags: opts.tag });
      ok(`tag: ${s.tagged} record(s) tagged`);
    } catch (e) {
      err(e.message);
      process.exit(1);
    }
  });

// No subcommand → launch the interactive wizard. The command closures capture a mutable `cfg`
// so the create-config flow takes effect within the same session.
if (process.argv.slice(2).length === 0) {
  const cfg = loadConfig({});
  const commands = {
    process: ({ dir, tags }) => {
      requireMemexId(cfg);
      const s = runProcess({ dir, out: cfg.out, memexId: cfg.memexId, tags });
      if (s.added.length) info(`added: ${s.added.join(', ')}`);
      ok(`process: ${s.records} record(s), ${s.collection} collection`);
    },
    tag: ({ dir, tags }) => {
      const s = runTag({ dir, out: cfg.out, tags });
      ok(`tag: ${s.tagged} record(s) tagged`);
    },
    update: () => {
      requireMemexId(cfg);
      const s = runUpdate({ library: cfg.library, out: cfg.out, memexId: cfg.memexId });
      ok(`update: ${s.records} record(s), ${s.collections} collection(s) from peers`);
    },
    verify: ({ dir }) => {
      const r = runVerify({ dir });
      for (const w of r.warnings) warn(formatWarning(w));
      if (r.ok) ok('verify: clean');
      else info(`verify: ${r.warnings.length} warning(s) — non-fatal`);
    },
    createConfig: ({ memexId, out, library }) => {
      const path = saveConfig({ cwd: process.cwd(), memexId, out, library });
      Object.assign(cfg, loadConfig({})); // reload so this session sees the new identity
      ok(`config written to ${path}`);
    },
  };

  startSession({ cwd: process.cwd(), libraryDir: cfg.library, commands, helpFn: () => program.outputHelp() })
    .then(() => process.exit(0))
    .catch((e) => { err(e.message); process.exit(1); });
} else {
  program.parse(process.argv);
}
