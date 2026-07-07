// The Record basename is the wikilink resolution key (spec §5): it must be STABLE across
// re-runs. We derive it from the filename slug alone, so it depends on nothing but the file.

export function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripExt(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

// Assign a stable basename to each asset. Collision policy (plan Phase 2 — "no silent
// overwrite"): if two assets with DISTINCT content hash slug to the same base, both are
// disambiguated with a short content-hash suffix and flagged. Assets that share a hash are the
// same Item (content-addressed) and keep their plain slug — writing the same Record twice is
// idempotent. The suffix is content-derived, so a basename never depends on directory order.
export function allocateBasenames(assets) {
  const distinctHashesBySlug = new Map();
  for (const a of assets) {
    const s = slug(stripExt(a.filename));
    if (!distinctHashesBySlug.has(s)) distinctHashesBySlug.set(s, new Set());
    distinctHashesBySlug.get(s).add(a.hex);
  }

  return assets.map((a) => {
    const s = slug(stripExt(a.filename));
    const collision = distinctHashesBySlug.get(s).size > 1;
    const basename = collision ? `${s}-${a.hex.slice(0, 8)}` : s;
    return { ...a, basename, collision };
  });
}
