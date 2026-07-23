import yaml from 'js-yaml';

// Build a Record's frontmatter — the curator-facing contract (record-indexing decision doc).
// Bare keys; byte-intrinsics live on the manifest/Item hub, never here.
//   title      → the asset's name (human-readable)
//   item       → the durable Item anchor: ni:///sha-256;<b64url>
//   path       → the asset's library-relative path (documentRecord fact)
//   uploadDate → when the asset entered the library (documentRecord fact)
//   tags       → curator tags
export function buildFrontmatter({ title, ni, path, uploadDate, tags = [] }) {
  const fm = { title, item: ni };
  if (path) fm.path = path;
  if (uploadDate) fm.uploadDate = uploadDate;
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
