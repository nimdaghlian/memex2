// The Record basename is the wikilink resolution key (spec §5): it must be STABLE across
// re-runs. We derive it from the filename slug alone, so it depends on nothing but the file.

export function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function stripExt(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

// Assign a stable basename per asset. Distinct-content assets that slug identically collide;
// they're disambiguated by INCREMENT (name, name-2, name-3…), assigned by stable hash order so a
// name never wanders between runs. Same-hash assets are the same Item → same basename (collapse).
// Every collider is flagged for a human to disambiguate at the source.
export function allocateBasenames(assets) {
  const hashesBySlug = new Map();
  for (const a of assets) {
    const s = slug(stripExt(a.filename));
    if (!hashesBySlug.has(s)) hashesBySlug.set(s, new Set());
    hashesBySlug.get(s).add(a.hex);
  }
  const rank = new Map(); // `${slug}#${hex}` → increment rank
  for (const [s, set] of hashesBySlug) {
    [...set].sort().forEach((hex, i) => rank.set(`${s}#${hex}`, i));
  }
  return assets.map((a) => {
    const s = slug(stripExt(a.filename));
    const collision = hashesBySlug.get(s).size > 1;
    const r = rank.get(`${s}#${a.hex}`);
    const basename = r === 0 ? s : `${s}-${r + 1}`;
    return { ...a, basename, collision };
  });
}
