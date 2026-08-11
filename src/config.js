import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import yaml from 'js-yaml';

export const CONFIG_NAME = 'memex.config.yml';

export const DEFAULTS = {
  memexId: null,
  curatorName: null,
  out: './site',
  library: './library',
  libraryMode: 'embedded',
  libraryUrl: '/library/',
};

export const LIBRARY_MODES = ['embedded', 'external'];

// Templates concatenate this prefix raw (`{{ site.libraryPrefix }}{{ path }}`), so without a
// trailing slash an origin glues itself onto the first path segment. Empty stays empty — that's
// a deliberate "the paths are already absolute" value, not an omission.
function normalizeLibraryUrl(url) {
  const v = String(url);
  return v === '' || v.endsWith('/') ? v : `${v}/`;
}

// Local machine config (spec §6/§7): `memexId` is this Memex's identity — the manifest's
// `originatedBy`. Secrets live in `.env`; this is not secret.
export function loadConfig({ cwd = process.cwd(), configPath } = {}) {
  const path = configPath
    ? (isAbsolute(configPath) ? configPath : resolve(cwd, configPath))
    : join(cwd, CONFIG_NAME);

  const raw = existsSync(path) ? (yaml.load(readFileSync(path, 'utf8')) ?? {}) : {};
  const against = (p) => (isAbsolute(p) ? p : resolve(cwd, p));

  const libraryMode = raw.libraryMode ?? DEFAULTS.libraryMode;
  if (!LIBRARY_MODES.includes(libraryMode)) {
    throw new Error(
      `Invalid libraryMode "${libraryMode}" in ${CONFIG_NAME} — must be one of: ${LIBRARY_MODES.join(', ')}.`,
    );
  }

  return {
    memexId: raw.memexId ?? DEFAULTS.memexId,
    curatorName: raw.curatorName ?? DEFAULTS.curatorName,
    out: against(raw.out ?? DEFAULTS.out),
    library: against(raw.library ?? DEFAULTS.library),
    libraryMode,
    libraryUrl: normalizeLibraryUrl(raw.libraryUrl ?? DEFAULTS.libraryUrl),
  };
}

// Write a memex.config.yml (used by the interactive create-config flow). Paths are stored as
// given — relative by default (./site, ./library) so the file stays portable across machines.
export function saveConfig({
  cwd = process.cwd(),
  memexId,
  curatorName,
  out = DEFAULTS.out,
  library = DEFAULTS.library,
  libraryMode = DEFAULTS.libraryMode,
  libraryUrl = DEFAULTS.libraryUrl,
}) {
  const path = join(cwd, CONFIG_NAME);
  const data = { memexId };
  if (curatorName) data.curatorName = curatorName; // omit rather than write `null`
  data.out = out;
  data.library = library;
  data.libraryMode = libraryMode;
  data.libraryUrl = libraryUrl;
  writeFileSync(path, yaml.dump(data));
  return path;
}
