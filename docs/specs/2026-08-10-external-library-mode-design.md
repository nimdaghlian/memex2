# Memex 2.0 — external library mode

> **Status: DRAFT, approved for implementation planning.** Authored 2026-08-10, from a design conversation in the Alice repo (`~/dev/alice`) that surfaced this need while designing how the Alice gallery kiosk serves the site + Library in production. See `~/dev/alice/docs/superpowers/specs/2026-08-06-memex2-migration-design.md` ("Serving architecture — why nginx is back") for the consuming side. This doc is memex2-repo-local: the code changes below all land here, not in Alice's `nixos/` config.

## 1. Purpose & scope

Today, memex2's Library serving assumes one layout: `library` lives at `site/library` (inside Eleventy's `site` input directory), and `eleventy.config.js` unconditionally passthrough-copies it to `_site/library`, reachable at `/library/...` via the hardcoded prefix in `site/_data/site.json`.

This is **embedded mode**. It works, but it has a real cost at Library scale (up to ~1TB per the existing code comment in `eleventy.config.js`): a `build`/`--watch` run does a genuine `recursive-copy` of the whole Library on every rebuild (`--serve` alone is exempt — see §3). It also doesn't match what `memex.config.yml.example` already implies is possible: its own default is `library: ./library`, **outside** `site/`, which the current hardcoded passthrough path (`'site/library'`) silently doesn't support — a pre-existing inconsistency, not something this spec introduces.

This spec adds **external library mode**: the Library lives wherever the operator wants (a separate drive, outside the checkout entirely, wherever a native web server already serves it from), and memex2 stops assuming it needs to copy or even see those bytes at build time. It only needs to keep computing correct relative asset paths and emitting correct URLs.

**Out of scope:** how any particular deployment actually serves the external Library (that's the operator's problem — Alice's answer is an nginx `alias`, documented in the Alice repo, not here). This spec only makes memex2 aware that two modes exist and correct in both.

## 2. Current behavior (baseline)

- `src/commands/process.js`: `assetPath = library ? relative(library, join(dir, filename)) : \`${dirName}/${filename}\`` — already library-root-relative when `library` is configured, regardless of where that root actually is on disk. This part already works for both modes without changes.
- `eleventy.config.js`: unconditionally calls `eleventyConfig.addPassthroughCopy({ 'site/library': 'library' })`, with `setServerPassthroughCopyBehavior('passthrough')` already set (existing uncommitted change at the time of writing — see the file's own comment, which explicitly flags that this only benefits `--serve`, not a `build`/`--watch` run).
- `site/_data/site.json`: a static, committed file holding `{ "libraryPrefix": "/library/" }`, read by the `assetUrl` template filter, which already passes absolute/full URLs through untouched and only prefixes relative ones — so `libraryPrefix` could already be an external origin, it's just not sourced from anywhere configurable per-install.
- `memex.config.yml.example`: defaults `library: ./library` (outside `site/`), which — per the hardcoded passthrough path above — doesn't actually work today. Nobody has hit this yet because the one real install (Alice) uses a hand-edited `library: ./site/library`.

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

### 4.2 `eleventy.config.js`

Replace the `site/_data/site.json` read with global data sourced from the same config loader the CLI uses (`src/config.js`), so there's one source of truth for `libraryMode`/`libraryUrl` instead of two files that can drift. **Keep the template-facing data key as `site.libraryPrefix`** — it's referenced directly (not just via the `assetUrl` filter) in `site/records.njk`, `site/tags.njk`, `site/_includes/record.njk`, `site/_includes/listing.njk`, and `site/_includes/directory.njk` (six call sites total). Renaming it would touch all of those for no benefit; only its *source* changes:

```js
import { loadConfig } from './src/config.js';

// inside the exported function:
const cfg = loadConfig({});
eleventyConfig.addGlobalData('site', { libraryPrefix: cfg.libraryUrl });

if (cfg.libraryMode === 'embedded') {
  eleventyConfig.setServerPassthroughCopyBehavior('passthrough');
  eleventyConfig.addPassthroughCopy({ 'site/library': 'library' });
}
// external mode: no passthrough registered at all — nothing to copy, nothing to serve locally.
```

`site/_data/site.json` is deleted. No template changes required — every existing `site.libraryPrefix` reference keeps working unchanged, now fed by config instead of a static file.

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

Fix the pre-existing inconsistency noted in §2 while adding the new fields: change the example's `library:` default from `./library` to `./site/library` (matching `libraryMode: embedded`'s expectation and what the one real install already uses), and add the two new fields with the explanatory comments shown in §4.1.

### 4.5 Documentation

Document both fields and modes wherever `memex.config.yml` fields are currently documented (`README.md` and/or `docs/quickstart.md` — confirm exact location when implementing). Make explicit that external mode requires the operator to serve the Library themselves; memex2 does not set up or manage that server.

## 5. Error handling

- Invalid `libraryMode` value → `loadConfig` throws at CLI startup with a message naming the bad value and the two valid options.
- `dir` outside configured `library` root during `process` → warning only (§4.3), processing continues.
- External mode with no Library actually reachable at `libraryUrl` at request time → out of scope; that's a deployment/operator concern (e.g. Alice's nginx `alias` misconfigured), not something memex2 can detect at build or process time since it never touches those bytes in external mode.

## 6. Testing

- `node --test`: new cases in whatever suite covers `src/config.js` — default values when `libraryMode`/`libraryUrl` are absent from `memex.config.yml`; rejection of an invalid `libraryMode` value.
- `node --test`: new cases in the `process.js` test suite — warning fires for a `dir` outside `library`; does not fire for one inside it.
- Manual build verification (no automated coverage for `eleventy.config.js` today, it's config not a unit): run `eleventy` once with `libraryMode: embedded` in a scratch config and confirm `_site/library` is populated; run again with `libraryMode: external` and confirm no `_site/library` directory is created and the build still succeeds even when `site/library` doesn't exist on disk at all.

## 7. Migration notes

No breaking change for the one existing real install (Alice): its `memex.config.yml` has no `libraryMode`/`libraryUrl` fields, so it defaults to `embedded` / `/library/`, identical to current behavior. Alice's own migration to `external` mode (paired with the nginx module) is tracked separately in the Alice repo and is a follow-up, not part of this spec.
