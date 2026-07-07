import { readdirSync } from 'node:fs';
import { extname } from 'node:path';

import { mimeForExt } from './mime.js';
import { MANIFEST_NAME } from './manifest.js';

// A directory's catalogable assets: real files whose extension maps to a known MIME. Dotfiles,
// the manifest, sub-directories and unsupported types are skipped. Sorted for determinism.
export function scanAssets(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)
    .filter(name => name !== MANIFEST_NAME && !name.startsWith('.') && mimeForExt(extname(name)))
    .sort();
}
