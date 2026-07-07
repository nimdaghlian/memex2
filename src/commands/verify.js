import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { scanAssets } from '../scan.js';
import { hashFile } from '../hash.js';
import { readManifest } from '../manifest.js';

// `verify`: asset-integrity job (spec §6, job a). Compare a processed directory's current state
// against its manifest.json — byte change, move/rename, deletion, stray/untracked file. WARN
// ONLY, non-fatal: the hash-in-manifest anchor means drift is surfaced, never silently corrupting.
// Returns a structured result the 11ty `before` hook can render; exit code stays success.
export function runVerify({ dir }) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }

  const manifest = readManifest(dir);
  if (!manifest) {
    return { ok: false, warnings: [{ type: 'no-manifest', dir }] };
  }

  const manifestByPath = new Map(manifest.items.map(i => [i.path, i]));
  const current = new Map(scanAssets(dir).map(name => [name, hashFile(join(dir, name)).hex]));

  const warnings = [];

  // Present files not in the manifest — candidate rename targets or strays.
  const extraByHash = new Map();
  for (const [name, hash] of current) {
    if (!manifestByPath.has(name)) extraByHash.set(hash, name);
  }
  const usedAsRenameTarget = new Set();

  for (const item of manifest.items) {
    if (current.has(item.path)) {
      if (current.get(item.path) !== item.hash) {
        warnings.push({ type: 'changed', path: item.path, was: item.hash, now: current.get(item.path) });
      }
      continue;
    }
    // Path is gone. Same bytes present elsewhere ⇒ rename; otherwise a deletion.
    const movedTo = extraByHash.get(item.hash);
    if (movedTo && !usedAsRenameTarget.has(movedTo)) {
      usedAsRenameTarget.add(movedTo);
      warnings.push({ type: 'renamed', from: item.path, to: movedTo, hash: item.hash });
    } else {
      warnings.push({ type: 'deleted', path: item.path, hash: item.hash });
    }
  }

  for (const [name, hash] of current) {
    if (manifestByPath.has(name)) continue;
    if (usedAsRenameTarget.has(name)) continue; // accounted for as a rename target
    warnings.push({ type: 'stray', path: name, hash });
  }

  return { ok: warnings.length === 0, warnings };
}
