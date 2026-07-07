import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

import { hashBytes } from './hash.js';
import { mimeForExt } from './mime.js';
import { probeDimensions } from './probe.js';

// Intrinsic facts are computed in a single pass over the bytes (spec §4): deterministic and
// identical on every Memex. Dimensions that can't be read are simply omitted — never stored as
// null — so the frontmatter/manifest stays clean. `duration` (a/v) is not probed in v1.
export function readIntrinsics(path, filename) {
  const buf = readFileSync(path);
  const { hex, ni } = hashBytes(buf);
  const ext = extname(filename ?? path);

  const facts = {
    hex,
    ni,
    mimetype: mimeForExt(ext),
    byteSize: buf.length,
  };

  const dims = probeDimensions(buf);
  if (dims) {
    facts.width = dims.width;
    facts.height = dims.height;
  }

  return facts;
}
