import { existsSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

import { scanAssets } from '../scan.js';
import { readIntrinsics } from '../intrinsics.js';
import { allocateBasenames, slug, stripExt } from '../basename.js';
import { extractDate } from '../date.js';
import { readManifest, writeManifest, itemFromFacts, mergeManifest } from '../manifest.js';
import { buildFrontmatter, serializeRecord } from '../record.js';
import { buildCollection } from '../collection.js';
import { ensureDir, itemsDir, collectionsDir, writeFileIfAllowed } from '../generate.js';
import { warn } from '../output.js';

// `process <dir>`: hash the directory's assets → write manifest.json (originatedBy: me) into the
// dir → generate local Records + one baseline Collection (spec §7). Pushing records to OP is the
// deferred seam (needs #238) and is NOT part of this wave.
export function runProcess({ dir, out, memexId, library, now = new Date().toISOString(), overwrite = false, tags = [], parseDate = true }) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }

  const dirName = basename(resolve(dir));

  // A directory outside the Library root still processes, but every Record's `path` becomes a
  // `../`-prefixed escape that no libraryUrl can resolve. Say it once, not once per asset — a
  // curator doing a deliberate one-off outside the normal layout doesn't need to be blocked.
  if (library && relative(library, resolve(dir)).startsWith('..')) {
    warn(`${dir}: outside configured library (${library}) — asset paths/URLs may not resolve correctly`);
  }

  const filenames = scanAssets(dir);

  // One pass over bytes: hash + intrinsic facts per asset.
  const assets = filenames.map((filename) => {
    const facts = readIntrinsics(join(dir, filename), filename);
    return { filename, facts };
  });

  // Stable basenames (the wikilink resolution key), with collision disambiguation.
  const named = allocateBasenames(assets.map(a => ({ filename: a.filename, hex: a.facts.hex })));
  for (const a of assets) {
    const n = named.find(x => x.filename === a.filename);
    a.basename = n.basename;
    if (n.collision) warn(`basename collision for ${a.filename}; disambiguated to ${n.basename}`);
    a.dateCreated = parseDate ? extractDate(a.filename) : null;
  }

  // Manifest: the machine-readable path→hash ledger, written INTO the directory (tracked marker).
  const entries = assets.map(a => itemFromFacts(a.filename, a.facts, a.dateCreated));
  const { manifest, added, changed } = mergeManifest(readManifest(dir), entries, { originatedBy: memexId, now });
  writeManifest(dir, manifest);
  const uploadDates = new Map(manifest.items.map(i => [i.path, i.uploadDate]));

  if (changed.length) warn(`${changed.length} asset(s) changed bytes since last process: ${changed.join(', ')}`);

  // Records: one per distinct basename (content-addressed duplicates collapse).
  ensureDir(itemsDir(out));
  let records = 0;
  const seen = new Set();
  const members = [];
  for (const a of assets) {
    if (seen.has(a.basename)) continue;
    seen.add(a.basename);
    members.push(a.basename);

    const assetPath = library
      ? relative(library, join(dir, a.filename))
      : `${dirName}/${a.filename}`;
    const frontmatter = buildFrontmatter({
      title: stripExt(a.filename),
      ni: a.facts.ni,
      path: assetPath,
      uploadDate: uploadDates.get(a.filename),
      tags,
    });
    const written = writeFileIfAllowed(join(itemsDir(out), `${a.basename}.md`), serializeRecord(frontmatter, ''), overwrite);
    if (written) records++;
  }

  // One processed directory ↔ one baseline Collection.
  ensureDir(collectionsDir(out));
  const collectionSlug = slug(dirName);
  const collectionMd = buildCollection({ name: dirName, members, addedBy: memexId, tags });
  const collectionWritten = writeFileIfAllowed(join(collectionsDir(out), `${collectionSlug}.md`), collectionMd, overwrite);

  return { records, collection: collectionWritten ? 1 : 0, added, changed, dir, out };
}
