// Resolve Obsidian-style [[wikilinks]] against a flat basename→URL map. The label shown is the
// text the curator typed; the key is its slug (lowercased, trimmed, dashed) — matching the CLI's
// Record basenames. Unknown links are left verbatim and reported (mirrors OP's "never store
// unresolved" rule; the site surfaces them as build warnings).
const WIKILINK = /\[\[\s*([^\]]+?)\s*\]\]/g;

// Exported so eleventy.config.js keys its basename→url map with the SAME normalization the
// resolver uses — the two must never drift.
export function keyOf(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function resolveWikilinks(text, urlFor) {
  const unresolved = [];
  const out = String(text).replace(WIKILINK, (whole, label) => {
    const url = urlFor.get(keyOf(label));
    if (!url) { unresolved.push(label); return whole; }
    return `<a href="${url}">${label}</a>`;
  });
  return { text: out, unresolved };
}
