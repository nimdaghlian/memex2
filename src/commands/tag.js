import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readManifest } from '../manifest.js';
import { parseRecord, serializeRecord, mergeTags } from '../record.js';
import { itemsDir } from '../generate.js';
import { niToHex } from '../hash.js';

// `tag <dir>`: add tags to every Record of an already-processed directory. Operates on the
// generated .md documents, not the assets — so run it after `process`. Records are matched by
// content hash (the directory's manifest hashes ↔ each Record's `niToHex(frontmatter.item)`),
// which is rename-safe, and the curator-owned body is preserved. Idempotent: only ever adds new tags.
export function runTag({ dir, out, tags = [] }) {
  const manifest = readManifest(dir);
  if (!manifest) {
    throw new Error(`Not processed (no manifest.json): ${dir} — run \`memex process\` first`);
  }

  const hashes = new Set(manifest.items.map(i => i.hash));
  const idir = itemsDir(out);
  let tagged = 0;

  if (existsSync(idir)) {
    for (const name of readdirSync(idir)) {
      if (!name.endsWith('.md')) continue;
      const path = join(idir, name);
      const { frontmatter, body } = parseRecord(readFileSync(path, 'utf8'));
      if (!frontmatter.item) continue;
      const hex = niToHex(frontmatter.item);
      if (!hashes.has(hex)) continue;

      const before = frontmatter.tags ?? [];
      const merged = mergeTags(before, tags);
      if (merged.length === before.length) continue; // nothing new — leave the file untouched

      frontmatter.tags = merged;
      writeFileSync(path, serializeRecord(frontmatter, body));
      tagged++;
    }
  }

  return { tagged, tags };
}
