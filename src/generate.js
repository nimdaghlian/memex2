import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Shared Record/Collection writers for the Record/Collection layer (local per Memex, spec §6).
// Records live at <out>/items/<basename>.md; Collections at <out>/collections/<slug>.md. The
// basename is the wikilink resolution key, so the on-disk name IS the stable basename.

export function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function itemsDir(out) {
  return join(out, 'items');
}

export function collectionsDir(out) {
  return join(out, 'collections');
}

// Write a file unless it already exists and overwrite is off. Returns true if written. Existing
// files are curator-owned (they may hold edited prose/wikilinks), so we never clobber by default.
export function writeFileIfAllowed(path, content, overwrite) {
  if (existsSync(path) && !overwrite) return false;
  writeFileSync(path, content);
  return true;
}
