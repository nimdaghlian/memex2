import yaml from 'js-yaml';

import { mediaCategory } from './mime.js';

// Build a Record's frontmatter object in the spec §4 shape. Every statement is outbound from the
// Record; the Item hub stays statement-free. Key order here is the emitted order.
//
//   item            → the one GENERATED structural edge (Record → ni: hash, subtype Item).
//                     Carried distinct from curator tags/wikilinks so #238's handler can stamp
//                     the Item subtype. The hash is expressed twice on purpose: `item` (ni: node)
//                     + `schema:sha256` (hex literal) — do not collapse them (spec §4).
//   schema:*        → documentRecord leaves (intrinsic/catalog facts).
//   memex:addedBy   → the only memex: term (provenance); everything else is schema.org.
//   mediaType       → NOT stored; derived from schema:encodingFormat at render (spec §4).
export function buildFrontmatter({ facts, filename, assetUrl, addedBy, uploadDate, dateCreated, tags = [], title }) {
  const fm = {
    title: title ?? filename,
    item: facts.ni,
    'schema:sha256': facts.hex,
    'schema:contentUrl': assetUrl,
  };

  if (facts.mimetype && mediaCategory(facts.mimetype) === 'image') {
    fm['schema:image'] = assetUrl;
  }
  if (facts.mimetype) fm['schema:encodingFormat'] = facts.mimetype;
  if (facts.byteSize != null) fm['schema:contentSize'] = facts.byteSize;
  if (facts.width != null) fm['schema:width'] = facts.width;
  if (facts.height != null) fm['schema:height'] = facts.height;
  if (facts.duration != null) fm['schema:duration'] = facts.duration;
  if (dateCreated) fm['schema:dateCreated'] = dateCreated;
  if (uploadDate) fm['schema:uploadDate'] = uploadDate;
  if (addedBy) fm['memex:addedBy'] = addedBy;

  fm.tags = tags;
  return fm;
}

export function serializeRecord(frontmatter, body = '') {
  const serialized = yaml.dump(frontmatter, { lineWidth: -1, quotingType: '"', sortKeys: false });
  const trimmedBody = body ? `\n${body.replace(/\n+$/, '')}\n` : '\n';
  return `---\n${serialized}---\n${trimmedBody}`;
}

// Inverse of serializeRecord: split a Record's frontmatter from its (curator-owned) body. Used
// when editing an existing Record in place — e.g. `tag` — so prose and wikilinks are preserved.
export function parseRecord(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: md };
  const frontmatter = yaml.load(match[1]) ?? {};
  const body = match[2].replace(/^\n/, '').replace(/\n$/, '');
  return { frontmatter, body };
}

// Append incoming tags to existing ones, de-duplicated, order preserved. A curator's own tags
// (added in the .md) always survive; this only ever adds.
export function mergeTags(existing = [], incoming = []) {
  const out = [...existing];
  for (const tag of incoming) {
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}
