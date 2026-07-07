import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The manifest lives INSIDE each processed directory so it travels with the assets on Syncthing
// sync (spec §6). Its presence is the tracked/untracked boundary: no manifest ⇒ invisible.
export const MANIFEST_NAME = 'manifest.json';
export const MANIFEST_VERSION = 1;

export function manifestPath(dir) {
  return join(dir, MANIFEST_NAME);
}

export function readManifest(dir) {
  const p = manifestPath(dir);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function writeManifest(dir, manifest) {
  const items = [...manifest.items].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const out = { ...manifest, items };
  writeFileSync(manifestPath(dir), JSON.stringify(out, null, 2) + '\n');
  return out;
}

// Shape a manifest entry from intrinsic facts (spec §6: path → hash ledger + intrinsic facts).
// `hash` is the hex; the `ni` URI rides alongside so peers/`update` need not recompute it.
export function itemFromFacts(path, facts, dateCreated) {
  const entry = { path, hash: facts.hex, ni: facts.ni, mimetype: facts.mimetype, byteSize: facts.byteSize };
  if (facts.width != null) entry.width = facts.width;
  if (facts.height != null) entry.height = facts.height;
  if (facts.duration != null) entry.duration = facts.duration;
  if (dateCreated) entry.dateCreated = dateCreated;
  return entry;
}

// Incremental, additive merge (spec §6): new files are added; a changed hash for a known path is
// updated in place (byte change — reported for `verify`); the original uploadDate is preserved.
// Existing entries are never disturbed by an unrelated add.
export function mergeManifest(existing, entries, { originatedBy, now }) {
  const prev = new Map((existing?.items ?? []).map(i => [i.path, i]));
  const added = [];
  const changed = [];
  const items = [];

  for (const entry of entries) {
    const before = prev.get(entry.path);
    if (!before) {
      items.push({ ...entry, uploadDate: now });
      added.push(entry.path);
    } else {
      if (before.hash !== entry.hash) changed.push(entry.path);
      items.push({ ...entry, uploadDate: before.uploadDate });
    }
  }

  // Preserve entries for paths not in this pass (a removed file surfaces via `verify`, not here).
  for (const [path, before] of prev) {
    if (!entries.some(e => e.path === path)) items.push(before);
  }

  const manifest = {
    version: MANIFEST_VERSION,
    originatedBy: originatedBy ?? existing?.originatedBy,
    items,
  };
  return { manifest, added, changed };
}
