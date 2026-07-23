import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import yaml from 'js-yaml';

import { MANIFEST_NAME } from '../manifest.js';
import { allocateBasenames, slug, stripExt } from '../basename.js';
import { buildFrontmatter, serializeRecord } from '../record.js';
import { buildCollection } from '../collection.js';
import { ensureDir, itemsDir, collectionsDir, writeFileIfAllowed } from '../generate.js';
import { niToHex } from '../hash.js';

// The local tracking store, without OP: the set of content hashes for which I already hold a
// Record (each Record carries item: ni-URI). This is what `update` diffs peer manifests against.
function collectLocalHashes(out) {
  const dir = itemsDir(out);
  if (!existsSync(dir)) return new Set();
  const hashes = new Set();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const fm = yaml.load(readFileSync(join(dir, name), 'utf8').split('---')[1] ?? '') ?? {};
    if (fm.item) hashes.add(niToHex(fm.item));
  }
  return hashes;
}

// Every manifest.json under the Library (recursive), with its containing directory.
function findManifests(library) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name === MANIFEST_NAME) {
        found.push({ dir, manifest: JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) });
      }
    }
  };
  if (existsSync(library)) walk(library);
  return found;
}

// `update`: scan the Library for manifests originatedBy OTHERS; for each hash not already tracked
// locally, generate a baseline Record + a baseline Collection per new directory (spec §7). Simple
// and diff-based — no conflict resolution, no two-way anything. Propagates addedBy onto each Item.
export function runUpdate({ library, out, memexId, now = new Date().toISOString(), overwrite = false }) {
  const tracked = collectLocalHashes(out);
  const added = [];
  let records = 0;
  let collections = 0;

  for (const { dir, manifest } of findManifests(library)) {
    if (manifest.originatedBy === memexId) continue; // only peers' assets

    const dirName = basename(dir);
    const named = allocateBasenames(manifest.items.map(i => ({ filename: i.path, hex: i.hash })));
    const basenameFor = new Map(named.map(n => [n.filename, n.basename]));

    ensureDir(itemsDir(out));
    for (const item of manifest.items) {
      if (tracked.has(item.hash)) continue; // already have a Record for this Item
      tracked.add(item.hash);

      const base = basenameFor.get(item.path);
      const frontmatter = buildFrontmatter({
        title: stripExt(item.path),
        ni: item.ni,
        path: relative(library, join(dir, item.path)),
        uploadDate: item.uploadDate ?? now,
        tags: [],
      });
      if (writeFileIfAllowed(join(itemsDir(out), `${base}.md`), serializeRecord(frontmatter, ''), overwrite)) {
        records++;
        added.push(item.hash);
      }
    }

    // One baseline Collection per peer directory (whole-directory membership).
    ensureDir(collectionsDir(out));
    const members = named.map(n => n.basename);
    const collectionMd = buildCollection({ name: dirName, members, addedBy: manifest.originatedBy });
    if (writeFileIfAllowed(join(collectionsDir(out), `${slug(dirName)}.md`), collectionMd, overwrite)) {
      collections++;
    }
  }

  return { records, collections, added, out };
}
