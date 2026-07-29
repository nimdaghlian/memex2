// A Collection body is split by a `---` rule: description above, membership link dump below
// (see src/collection.js, which generates it). These read that convention back out — once from
// the raw markdown (to find members) and once from the rendered HTML (to find the description).

// Front matter is a `---` fence too, so drop it before looking for the rule. Eleventy's
// page.rawInput normally excludes it; this keeps the helper safe for raw file contents as well.
function stripFrontmatter(raw) {
  return String(raw).replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

// The membership half of a Collection body. No rule → the whole body is membership, which is how
// Collections generated before the rule existed keep working.
export function membersSection(raw) {
  const body = stripFrontmatter(raw || '');
  const rule = body.search(/^\s*(?:---|\*\*\*|___)\s*$/m);
  if (rule === -1) return body;
  return body.slice(body.indexOf('\n', rule) + 1);
}

// The description half, read off the RENDERED html (markdown turned the rule into an <hr>).
// Editor-facing comments are stripped so an untouched generated Collection reads as empty.
export function descriptionSection(html) {
  const text = String(html || '');
  const rule = text.search(/<hr\s*\/?>/i);
  return (rule === -1 ? '' : text.slice(0, rule)).replace(/<!--[\s\S]*?-->/g, '').trim();
}
