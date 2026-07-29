import { loadConfig } from '../../src/config.js';

// The site reads the SAME memex.config.yml the CLI does, so the machine identity on the page and
// the one stamped into manifests/Records can never disagree. memex.config.yml is gitignored (it's
// per-machine), hence the fallback for a checkout that hasn't run `create config` yet.
export default function () {
  try {
    const { memexId, curatorName } = loadConfig();
    return { id: memexId || 'memex', curator: curatorName || null };
  } catch {
    return { id: 'memex', curator: null };
  }
}
