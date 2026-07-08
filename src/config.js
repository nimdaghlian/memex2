import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import yaml from 'js-yaml';

export const CONFIG_NAME = 'memex.config.yml';

export const DEFAULTS = { memexId: null, out: './site', library: './library' };

// Local machine config (spec §6/§7): `memexId` is this Memex's identity — the manifest
// `originatedBy` and the Record `memex:addedBy`. Secrets live in `.env`; this is not secret.
export function loadConfig({ cwd = process.cwd(), configPath } = {}) {
  const path = configPath
    ? (isAbsolute(configPath) ? configPath : resolve(cwd, configPath))
    : join(cwd, CONFIG_NAME);

  const raw = existsSync(path) ? (yaml.load(readFileSync(path, 'utf8')) ?? {}) : {};
  const against = (p) => (isAbsolute(p) ? p : resolve(cwd, p));

  return {
    memexId: raw.memexId ?? DEFAULTS.memexId,
    out: against(raw.out ?? DEFAULTS.out),
    library: against(raw.library ?? DEFAULTS.library),
  };
}

// Write a memex.config.yml (used by the interactive create-config flow). Paths are stored as
// given — relative by default (./site, ./library) so the file stays portable across machines.
export function saveConfig({ cwd = process.cwd(), memexId, out = DEFAULTS.out, library = DEFAULTS.library }) {
  const path = join(cwd, CONFIG_NAME);
  writeFileSync(path, yaml.dump({ memexId, out, library }));
  return path;
}
