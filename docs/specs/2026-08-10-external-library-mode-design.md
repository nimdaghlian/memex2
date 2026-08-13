# Memex 2.0 — external library mode

> **Status: APPROVED for implementation.** Authored 2026-08-10; revised 2026-08-10 after implementation review (see §8 for what changed and why). Originally from a design conversation in the Alice repo (`~/dev/alice`) that surfaced this need while designing how the Alice gallery kiosk serves the site + Library in production. See `~/dev/alice/docs/superpowers/specs/2026-08-06-memex2-migration-design.md` ("Serving architecture — why nginx is back") for the consuming side. This doc is memex2-repo-local: the code changes below all land here, not in Alice's `nixos/` config.

## 1. Purpose & scope

Today, memex2's Library serving assumes one layout: `library` lives at `site/library` (inside Eleventy's `site` input directory), and `eleventy.config.js` unconditionally passthrough-copies it to `_site/library`, reachable at `/library/...` via the hardcoded prefix in `site/_data/site.json`.

This is **embedded mode**. It works, but it has a real cost at Library scale (up to ~1TB per the existing code comment in `eleventy.config.js`): a `build`/`--watch` run does a genuine `recursive-copy` of the whole Library on every rebuild (`--serve` alone is exempt — see §3). It also doesn't match what `memex.config.yml.example` already implies is possible: its own default is `library: ./library`, **outside** `site/`, which the current hardcoded passthrough path (`'site/library'`) silently doesn't support — a pre-existing bug, not something this spec introduces. This spec fixes it (§4.2, §4.4) rather than documenting around it: the passthrough source is derived from the operator's configured `library`, so the field means the same thing to `process` and to the build.

This spec adds **external library mode**: the Library lives wherever the operator wants (a separate drive, outside the checkout entirely, wherever a native web server already serves it from), and memex2 stops assuming it needs to copy or even see those bytes at build time. It only needs to keep computing correct relative asset paths and emitting correct URLs.

**Out of scope:** how any particular deployment actually serves the external Library (that's the operator's problem — Alice's answer is an nginx `alias`, documented in the Alice repo, not here). This spec only makes memex2 aware that two modes exist and correct in both.

## 2. Current behavior (baseline)

- `src/commands/process.js`: `assetPath = library ? relative(library, join(dir, filename)) : \`${dirName}/${filename}\`` — already library-root-relative when `library` is configured, regardless of where that root actually is on disk. This part already works for both modes without changes.
- `eleventy.config.js`: unconditionally calls `eleventyConfig.addPassthroughCopy({ 'site/library': 'library' })`, with `setServerPassthroughCopyBehavior('passthrough')` already set (existing uncommitted change at the time of writing — see the file's own comment, which explicitly flags that this only benefits `--serve`, not a `build`/`--watch` run).
- `site/_data/site.json`: a static, committed file holding `{ "libraryPrefix": "/library/" }`, read by the `assetUrl` template filter, which already passes absolute/full URLs through untouched and only prefixes relative ones — so `libraryPrefix` could already be an external origin, it's just not sourced from anywhere configurable per-install.
- `memex.config.yml.example`: defaults `library: ./library` (outside `site/`), which — per the hardcoded passthrough path above — doesn't actually work today. `docs/getting-started.md` walks the reader through that same broken layout (`mkdir -p library/fallen-trees`, then `process library/fallen-trees`): `process` writes correct Library-relative `path:` frontmatter, the templates render correct `/library/...` URLs, and every one of those URLs 404s because Eleventy copied `site/library`, which doesn't exist. Nobody has hit this yet because the one real install (Alice) uses a hand-edited `library: ./site/library`.
- `@11ty/eleventy` v3.1.6 already rejects a passthrough whose source lies outside the project folder (`src/TemplatePassthrough.js`, `copy()`: *"Source file is not in the project directory. Check your passthrough paths."*). Embedded mode therefore cannot serve an out-of-checkout Library no matter how the passthrough is registered — which is what makes external mode the only correct answer for that layout, and what §5 turns into a legible startup error.

## 3. Confirmed constraint (why this matters)

Verified against the installed `@11ty/eleventy` v3.1.6 source (`node_modules/@11ty/eleventy/src/Util/PassthroughCopyBehaviorCheck.js`): Eleventy's no-copy "passthrough for free" behavior is gated to `runMode === "serve"` only —

> `// False when runMode is "build" or "watch"`

`cmd.cjs` sets `runMode` from `argv.serve ? "serve" : argv.watch ? "watch" : "build"`. So `setServerPassthroughCopyBehavior('passthrough')` only ever helps a `--serve` session; a `--watch`-only session (needed for live-reload without also running Eleventy's own HTTP server — e.g. Alice's design, which fronts everything with nginx instead) still does a full `recursive-copy` of the Library on every detected change. This is the concrete cost external mode exists to avoid.

## 4. Design

### 4.1 New config fields (`memex.config.yml`)

```yaml
# embedded (default): library lives under site/, Eleventy passthrough-copies it into _site/library.
# external: library lives wherever you point `library` at; nothing under this checkout serves it —
# your own web server does (see the Alice repo's nginx module for one example). No copy, ever.
libraryMode: embedded

# URL prefix (or full external origin) used to build each Record's asset link. Relative paths are
# prefixed with this; absolute paths/URLs pass through untouched (existing assetUrl filter behavior).
libraryUrl: /library/
```

Both are optional; `src/config.js`'s loader defaults `libraryMode` to `'embedded'` and `libraryUrl` to `'/library/'` when absent, so existing installs' `memex.config.yml` (which predate these fields) keep working unchanged.

`loadConfig` validates `libraryMode` is exactly `'embedded'` or `'external'` and throws a clear error otherwise, in the same style as the existing `requireMemexId` check in `bin/memex.js` — fail at CLI startup, not with a confusing downstream symptom.

`loadConfig` also **normalizes `libraryUrl` to end in `/`**, appending one when absent. The templates concatenate raw (`{{ site.libraryPrefix }}{{ path }}` in `site/_includes/record.njk`), so a value like `https://assets.example.com/lib` would otherwise silently produce `https://assets.example.com/libfallen-trees/tree.jpg`. An explicitly empty string is left empty — that's a meaningful "no prefix, paths are already absolute" value, not a mistake.

`saveConfig` writes both fields with their defaults into every generated `memex.config.yml`, so a wizard-created config is self-documenting about the two modes. The interactive create-config flow (`src/interactive.js`) gains **no new prompts** — switching to external mode is a deliberate operator edit, not a first-run question.

### 4.2 `eleventy.config.js`

Replace the `site/_data/site.json` read with global data sourced from the same config loader the CLI uses (`src/config.js`), so there's one source of truth for `libraryMode`/`libraryUrl` instead of two files that can drift. **Keep the template-facing data key as `site.libraryPrefix`** — it's referenced directly (not just via the `assetUrl` filter) in `site/records.njk`, `site/tags.njk`, `site/_includes/record.njk`, `site/_includes/listing.njk`, and `site/_includes/directory.njk` (six call sites total). Renaming it would touch all of those for no benefit; only its *source* changes:

The passthrough source is **derived from `cfg.library`**, not hardcoded — this is what fixes the §2 bug. `cfg.library` is already absolute (the loader resolves it), so it's made project-relative for Eleventy:

```js
import { relative } from 'node:path';
import { loadConfig } from './src/config.js';

// inside the exported function:
const cfg = loadConfig({});
eleventyConfig.addGlobalData('site', { libraryPrefix: cfg.libraryUrl });

if (cfg.libraryMode === 'embedded') {
  const src = relative(process.cwd(), cfg.library);
  if (!src || src.startsWith('..')) {
    throw new Error(
      `libraryMode: embedded requires library (${cfg.library}) to be inside the project. ` +
      `Move it under the project root, or set libraryMode: external and serve it yourself.`,
    );
  }
  eleventyConfig.setServerPassthroughCopyBehavior('passthrough');
  eleventyConfig.addPassthroughCopy({ [src]: 'library' });
}
// external mode: no passthrough registered at all — nothing to copy, nothing to serve locally.
```

`loadConfig({})` reads `memex.config.yml` from `process.cwd()`. The CLI's `--config` flag has no Eleventy equivalent and none is added: the build is always run from the project root (`npm run build:site`), and an absent config yields the defaults, which is the correct result.

The explicit throw pre-empts Eleventy's own out-of-project rejection (§2) with a message that names the fix. It fires at config-load time, before any file is written.

`site/_data/site.json` is deleted (it is git-tracked — `git rm`). No template changes required — every existing `site.libraryPrefix` reference keeps working unchanged, now fed by config instead of a static file.

### 4.3 `src/commands/process.js` — out-of-library warning

After computing `assetPath`, check whether it's actually inside the library root:

```js
if (library) {
  const rel = relative(library, join(dir, a.filename)); // may already be computed above; reuse
  if (rel.startsWith('..')) {
    warn(`${dir}: outside configured library (${library}) — asset paths/URLs may not resolve correctly`);
  }
}
```

Matches the existing warning idiom (`warn()` from `../output.js`, same as the basename-collision warning already in this file) — informational, does not block processing, since a curator running a one-off outside the normal layout may have a legitimate reason.

### 4.4 `memex.config.yml.example`

**The example's `library: ./library` default stays as it is.** With the passthrough source derived from config (§4.2), `./library` now works in embedded mode, so the §2 bug is fixed in code rather than by bending the docs to match a hardcoded path. `docs/getting-started.md`'s `mkdir -p library/fallen-trees` walkthrough becomes true as written, with no doc edit needed.

This section therefore reduces to: add the two new fields with the explanatory comments shown in §4.1.

### 4.5 Documentation

Document both fields and modes wherever `memex.config.yml` fields are currently documented (`README.md` and/or `docs/quickstart.md` — confirm exact location when implementing). Make explicit that external mode requires the operator to serve the Library themselves; memex2 does not set up or manage that server.

## 5. Error handling

- Invalid `libraryMode` value → `loadConfig` throws at CLI startup with a message naming the bad value and the two valid options.
- `libraryMode: embedded` with a `library` that resolves outside the project root → `eleventy.config.js` throws at config-load time (§4.2), naming `libraryMode: external` as the fix. Without this, Eleventy raises its own generic *"Source file is not in the project directory"* (§2) — the same failure, harder to act on. This is a build-time error only; the CLI (`process`, `tag`, `verify`) is indifferent to where the Library lives and keeps working.
- `dir` outside configured `library` root during `process` → warning only (§4.3), processing continues.
- External mode with no Library actually reachable at `libraryUrl` at request time → out of scope; that's a deployment/operator concern (e.g. Alice's nginx `alias` misconfigured), not something memex2 can detect at build or process time since it never touches those bytes in external mode.

## 6. Testing

Back-end logic only — nothing here asserts on templates or rendered markup.

- `test/config.test.js` — `libraryMode`/`libraryUrl` default to `'embedded'`/`'/library/'` when absent; an invalid `libraryMode` is rejected; `libraryUrl` gains a trailing slash when it lacks one (`/lib` → `/lib/`, `https://cdn.example.com/x` → `https://cdn.example.com/x/`); a value that already ends in `/` is untouched; an empty string stays empty; `saveConfig` → `loadConfig` round-trips both new fields.
- `test/process.test.js` — the §4.3 warning fires for a `dir` outside `library` and stays silent for one inside it.
- Manual build verification (no automated coverage for `eleventy.config.js`; it's config, not a unit). Three runs against a scratch config:
  1. `libraryMode: embedded`, `library: ./site/library` → `_site/library` populated (today's behavior, unchanged).
  2. `libraryMode: embedded`, `library: ./library` → `_site/library` populated from the out-of-`site/` root. **This is the §2 bug; it fails on `main` and must pass here.**
  3. `libraryMode: external` → no `_site/library` directory created, and the build still succeeds with no Library on disk at all.
  
  Plus the error path: `libraryMode: embedded` with a `library` outside the checkout → build fails with the §4.2 message, not Eleventy's generic one.

## 7. Migration notes

No breaking change for the one existing real install (Alice): its `memex.config.yml` has no `libraryMode`/`libraryUrl` fields, so it defaults to `embedded` / `/library/`, identical to current behavior. Its hand-edited `library: ./site/library` keeps working too — under §4.2 the passthrough is now derived from that value instead of coincidentally matching a hardcoded one, which yields the same `_site/library` output. Alice's own migration to `external` mode (paired with the nginx module) is tracked separately in the Alice repo and is a follow-up, not part of this spec.

Installs that followed `memex.config.yml.example` or `docs/getting-started.md` literally (`library: ./library`) were silently broken before this change and are fixed by it — assets start resolving with no config edit on their part.

## 8. Revision log

Revised 2026-08-10 after an implementation review of the DRAFT against the code. Four changes:

1. **§4.2 / §4.4 — derive the passthrough source from `cfg.library`** instead of keeping it hardcoded and moving the example to match. The DRAFT's §4.4 would have documented the §2 bug rather than fixing it, leaving `library:` as a field with exactly one working value in embedded mode. Deriving it makes the field mean one thing in both `process` and the build, and makes the existing getting-started walkthrough true.
2. **§5 — explicit throw for embedded-mode-with-out-of-checkout-library.** Surfaced by the §2 finding that Eleventy already rejects this case with a generic message; the DRAFT didn't cover the boundary at all.
3. **§4.1 — `libraryUrl` is normalized to a trailing slash.** The templates concatenate raw, so the DRAFT's "full external origin" use case broke on the most natural way to write one.
4. **§4.1 — `saveConfig` writes both fields; no new wizard prompts.** The DRAFT was silent on the create-config flow.
