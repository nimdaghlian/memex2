# External Library Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Library live either inside the checkout (embedded, Eleventy copies it) or anywhere the operator wants (external, their own web server serves it), and fix the pre-existing bug where the Eleventy passthrough ignores the configured `library` path.

**Architecture:** Two new optional `memex.config.yml` fields — `libraryMode` (`embedded` | `external`) and `libraryUrl` — are loaded, validated, and normalized by the existing `src/config.js` loader, which becomes the single source of truth. `eleventy.config.js` reads that same loader: it feeds `site.libraryPrefix` from `libraryUrl` (replacing the static `site/_data/site.json`) and, in embedded mode only, registers a passthrough whose **source is derived from `cfg.library`** rather than hardcoded. External mode registers no passthrough at all.

**Tech Stack:** Node 18+ ESM, `node --test` (no test framework), `js-yaml`, Eleventy 3.1.6, Nunjucks templates.

**Spec:** `docs/specs/2026-08-10-external-library-mode-design.md` (APPROVED, revised — see its §8).

## Global Constraints

- **Back-end logic only in tests.** Never assert on templates, rendered markup, or Nunjucks output. `eleventy.config.js` gets manual verification, not unit tests.
- **The template-facing data key stays `site.libraryPrefix`.** Six call sites depend on it (`site/records.njk`, `site/tags.njk`, `site/_includes/record.njk`, `site/_includes/listing.njk`, `site/_includes/directory.njk`). Only its *source* changes. **No template file is edited by this plan.**
- **No breaking change for existing configs.** Both fields are optional and default to today's behavior (`embedded`, `/library/`).
- **Branch:** all work lands on `external-library-mode`. Do not push to `main`.
- **Test command:** `npm test` (= `node --test 'test/**/*.test.js'`). Run a single file with `node --test test/config.test.js`.
- **Comment style:** this codebase writes *why*, not *what*, in full sentences. Match the density of the file you're editing.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/config.js` | Modify | Single source of truth: defaults, validation, `libraryUrl` normalization, `saveConfig` output |
| `test/config.test.js` | Modify | Coverage for defaults, validation, normalization, round-trip |
| `src/commands/process.js` | Modify | One-shot warning when `dir` sits outside the Library root |
| `test/process.test.js` | Modify | Coverage for that warning (fires / stays silent) |
| `eleventy.config.js` | Modify | Config-sourced `site.libraryPrefix`; mode-gated, config-derived passthrough |
| `site/_data/site.json` | **Delete** (`git rm`) | Superseded — its value now comes from config |
| `memex.config.yml.example` | Modify | Document the two new fields |
| `docs/quickstart.md`, `README.md` | Modify | Document both modes and the operator's responsibility in external mode |

Task order matters: Task 1 produces the config fields Task 3 consumes. Task 2 is independent of both and could run in parallel.

---

### Task 1: Config fields — defaults, validation, normalization

**Files:**
- Modify: `src/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `loadConfig()` returns two new properties — `libraryMode: 'embedded' | 'external'` and `libraryUrl: string` (always `''` or ending in `/`). Throws `Error` on an invalid `libraryMode`. `saveConfig({ ..., libraryMode?, libraryUrl? })` writes both. New export: `LIBRARY_MODES: string[]`. Task 3 consumes `cfg.libraryMode`, `cfg.libraryUrl`, and the existing `cfg.library`.

- [ ] **Step 1: Write the failing tests**

Append to `test/config.test.js`:

```js
test('libraryMode and libraryUrl default to embedded and /library/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: memex-alice\n');

  const cfg = loadConfig({ cwd: dir });
  assert.equal(cfg.libraryMode, 'embedded');
  assert.equal(cfg.libraryUrl, '/library/');
});

test('loadConfig rejects a libraryMode outside embedded/external', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: memex-alice\nlibraryMode: hybrid\n');

  assert.throws(() => loadConfig({ cwd: dir }), /Invalid libraryMode "hybrid"/);
});

// The templates concatenate the prefix raw, so a missing trailing slash would glue the origin
// straight onto the first path segment: https://cdn.example.com/libfallen-trees/one.png
test('libraryUrl gains a trailing slash when it lacks one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: a\nlibraryUrl: https://cdn.example.com/lib\n');

  assert.equal(loadConfig({ cwd: dir }).libraryUrl, 'https://cdn.example.com/lib/');
});

test('a libraryUrl that already ends in a slash is left alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: a\nlibraryUrl: /assets/\n');

  assert.equal(loadConfig({ cwd: dir }).libraryUrl, '/assets/');
});

// An explicit empty string means "no prefix, the paths are already absolute" — a real choice,
// not a mistake, so it must not acquire a slash.
test('an empty libraryUrl stays empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  writeFileSync(join(dir, 'memex.config.yml'), 'memexId: a\nlibraryUrl: ""\n');

  assert.equal(loadConfig({ cwd: dir }).libraryUrl, '');
});

test('saveConfig writes libraryMode and libraryUrl that loadConfig reads back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  saveConfig({ cwd: dir, memexId: 'memex-nim', libraryMode: 'external', libraryUrl: 'https://cdn.example.com/lib/' });

  const cfg = loadConfig({ cwd: dir });
  assert.equal(cfg.libraryMode, 'external');
  assert.equal(cfg.libraryUrl, 'https://cdn.example.com/lib/');
});

test('saveConfig defaults the new fields so generated configs are self-documenting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-cfg-'));
  saveConfig({ cwd: dir, memexId: 'memex-nim' });

  const written = readFileSync(join(dir, CONFIG_NAME), 'utf8');
  assert.match(written, /libraryMode: embedded/);
  assert.match(written, /libraryUrl: \/library\//);
});
```

Add `readFileSync` to the existing `node:fs` import at the top of the file (it currently imports `mkdtempSync, writeFileSync` on one line and `existsSync` on another).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/config.test.js`
Expected: FAIL — the new assertions report `undefined` for `libraryMode`/`libraryUrl`, and the `assert.throws` case fails because nothing throws.

- [ ] **Step 3: Implement in `src/config.js`**

Extend `DEFAULTS` and add the mode list plus the normalizer above `loadConfig`:

```js
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
```

Inside `loadConfig`, after `const against = ...`, validate the mode and add both fields to the returned object:

```js
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
```

Extend `saveConfig`'s destructured signature and body:

```js
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
```

**Do not touch `src/interactive.js`.** Its create-config flow gains no prompts; it calls `saveConfig` without the new arguments and picks up the defaults automatically. This is deliberate (spec §4.1).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/config.test.js`
Expected: PASS, all tests including the five pre-existing ones.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS with no edits to other test files. `test/cli-interactive.e2e.test.js` exercises the create-config flow and its generated config now gains two lines, but its assertion is `assert.match(readFileSync(cfgPath, 'utf8'), /memexId: memex-e2e/)` — a substring match, unaffected by the additions.

- [ ] **Step 6: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat(config): add libraryMode and libraryUrl fields

Both optional, defaulting to embedded and /library/ so existing configs
keep working. libraryUrl is normalized to a trailing slash because the
templates concatenate it raw; an explicit empty string is preserved."
```

---

### Task 2: Warn when a processed directory sits outside the Library

**Files:**
- Modify: `src/commands/process.js`
- Test: `test/process.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 — `runProcess` already receives `library` as a parameter.
- Produces: a `warn()` line on stdout matching `outside configured library`. `runProcess`'s return value and all existing behavior are unchanged; processing continues.

**Note on placement:** the spec's §4.3 sketch computes the check per-asset inside the record loop. Implement it **once, before the loop** instead — the answer is identical for every asset in the directory, and firing it per-asset would print N copies of the same line. The message text is directory-scoped already.

- [ ] **Step 1: Write the failing tests**

Add this helper near the top of `test/process.test.js`, below the existing `setup()` function:

```js
// `warn()` writes straight to stdout (src/output.js), so capturing it means swapping the writer.
function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}
```

Then append the tests:

```js
test('processing a directory outside the configured library warns', () => {
  const { root, dir, out } = setup();
  const library = join(root, 'elsewhere');
  mkdirSync(library);

  const output = captureStdout(() =>
    runProcess({ dir, out, memexId: 'memex-alice', library, now: NOW }),
  );

  assert.match(output, /outside configured library/);
});

test('processing a directory inside the configured library does not warn', () => {
  const { root, dir, out } = setup();

  // setup() puts dir at <root>/fallen-trees, so root IS the library root here.
  const output = captureStdout(() =>
    runProcess({ dir, out, memexId: 'memex-alice', library: root, now: NOW }),
  );

  assert.doesNotMatch(output, /outside configured library/);
});
```

`mkdirSync` and `join` are already imported in this file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/process.test.js`
Expected: the first new test FAILS (no warning is emitted, so `assert.match` finds nothing). The second PASSES already — that's fine and expected; it's the regression guard proving the warning stays quiet in the normal case.

- [ ] **Step 3: Implement in `src/commands/process.js`**

Insert directly after `const dirName = basename(resolve(dir));`:

```js
  // A directory outside the Library root still processes, but every Record's `path` becomes a
  // `../`-prefixed escape that no libraryUrl can resolve. Say it once, not once per asset — a
  // curator doing a deliberate one-off outside the normal layout doesn't need to be blocked.
  if (library && relative(library, resolve(dir)).startsWith('..')) {
    warn(`${dir}: outside configured library (${library}) — asset paths/URLs may not resolve correctly`);
  }
```

`relative`, `resolve`, and `warn` are all already imported by this file. No other change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/process.test.js`
Expected: PASS, both new tests and all pre-existing ones.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. If `test/cli.e2e.test.js` or `test/dryrun.e2e.test.js` newly print the warning, confirm it's because their fixture genuinely processes outside its `library` — the E2E scaffold uses `library: ./library` with assets at `library/photos`, which is *inside*, so no warning should appear.

- [ ] **Step 6: Commit**

```bash
git add src/commands/process.js test/process.test.js
git commit -m "feat(process): warn when a processed dir is outside the Library root

Warn-only, once per directory rather than once per asset: the resulting
Record paths escape the Library with ../ and won't resolve under any
libraryUrl, but a deliberate one-off shouldn't be blocked."
```

---

### Task 3: Eleventy — config-sourced prefix and mode-gated, config-derived passthrough

**Files:**
- Modify: `eleventy.config.js`
- Delete: `site/_data/site.json` (git-tracked — use `git rm`)
- Test: none. This is build config, verified manually per the Global Constraints.

**Interfaces:**
- Consumes: from Task 1 — `loadConfig()` returning `{ library, libraryMode, libraryUrl }`, where `library` is an absolute path.
- Produces: global data `site.libraryPrefix` (string). No downstream task consumes this; the templates already do.

**Why `site/_data/site.json` MUST be deleted, not just ignored:** Eleventy's `_data` directory files take **precedence over** `addGlobalData`. Leaving `site.json` in place would silently win over the config-sourced value and the whole task would be a no-op that looks correct.

**Why `addGlobalData` here rather than a new `site/_data/site.js`:** `site/_data/memex.js` sets the precedent of a `_data` file calling `loadConfig`, so `site/_data/site.js` would also be idiomatic. `eleventy.config.js` is chosen because it must call `loadConfig` anyway to decide the passthrough, so this keeps a single load and puts both library-related decisions in one place.

- [ ] **Step 1: Rewrite the Library passthrough block in `eleventy.config.js`**

Add `relative` to the existing `node:path` usage and import the loader. The file currently does `import path from 'node:path'`; add a second import rather than reworking the existing `path.` call sites:

```js
import { relative } from 'node:path';
import { loadConfig } from './src/config.js';
```

Replace the entire Library-passthrough comment block and its two calls (from the `// Serve the asset Library ...` comment through `eleventyConfig.addPassthroughCopy({ 'site/library': 'library' });`) with:

```js
  // The Library's location AND how it's served both come from memex.config.yml, the same file the
  // CLI reads — so `library:` means one thing in `process` and in the build. (It didn't before:
  // the passthrough source was hardcoded to site/library, so the example config's own default of
  // ./library produced correct Record paths pointing at bytes the build never copied.)
  //
  // embedded: Eleventy serves the Library out of _site/library.
  // external: it doesn't exist as far as Eleventy is concerned — your own web server serves it at
  // libraryUrl, and nothing here copies ~1TB on every rebuild.
  const cfg = loadConfig({});
  eleventyConfig.addGlobalData('site', { libraryPrefix: cfg.libraryUrl });

  if (cfg.libraryMode === 'embedded') {
    // cfg.library is absolute; Eleventy wants it project-relative.
    const librarySrc = relative(process.cwd(), cfg.library);
    if (!librarySrc || librarySrc.startsWith('..')) {
      throw new Error(
        `libraryMode: embedded requires library (${cfg.library}) to be inside the project. ` +
        `Move it under the project root, or set libraryMode: external and serve it yourself.`,
      );
    }

    // 'passthrough' (not the default 'copy') lets the dev server serve these files straight from
    // source instead of copying them into _site. Verified against @11ty/eleventy 3.1.6: this is
    // gated to runMode === "serve" only, so a plain build and a --watch session still do a real
    // recursive-copy. That cost is exactly what external mode exists to avoid.
    eleventyConfig.setServerPassthroughCopyBehavior('passthrough');
    eleventyConfig.addPassthroughCopy({ [librarySrc]: 'library' });
  }
```

Leave every other part of the file untouched — the `_assets` passthrough, all filters, the wikilink transform, and the returned `dir` config.

- [ ] **Step 2: Delete the superseded static data file**

```bash
git rm site/_data/site.json
```

- [ ] **Step 3: Verify case A — embedded, Library inside `site/` (today's behavior)**

```bash
cp memex.config.yml memex.config.yml.bak       # gitignored; restored in Step 7
rm -rf _site
npm run build:site
ls _site/library
```

Expected: the build succeeds and `_site/library` contains the contents of `site/library` (currently a directory named `a test`).

- [ ] **Step 4: Verify case B — embedded, Library OUTSIDE `site/`. This is the bug fix.**

```bash
mkdir -p library/scratch && echo scratch > library/scratch/note.txt
sed -i '' 's|^library: .*|library: ./library|' memex.config.yml
rm -rf _site
npm run build:site
ls _site/library/scratch/note.txt
```

Expected: the build succeeds and `_site/library/scratch/note.txt` exists.
**This is the case that fails on `main`** — there, the hardcoded `site/library` is copied instead and `_site/library/scratch` never appears. If you want to see the old failure for contrast, `git stash` the eleventy change and re-run.

- [ ] **Step 5: Verify case C — external mode copies nothing**

```bash
printf 'libraryMode: external\nlibraryUrl: https://cdn.example.com/lib\n' >> memex.config.yml
rm -rf _site
npm run build:site
ls _site/library 2>&1     # expect: No such file or directory
grep -r 'cdn.example.com/lib/' _site/items | head -3
```

Expected: the build succeeds, `_site/library` does **not** exist, and the generated Record pages link to `https://cdn.example.com/lib/...` — with the trailing slash Task 1's normalizer added, since the config value above deliberately omits it.

- [ ] **Step 6: Verify the error path — embedded with an out-of-checkout Library**

```bash
cp memex.config.yml.bak memex.config.yml
sed -i '' 's|^library: .*|library: /tmp/outside-library|' memex.config.yml
npm run build:site 2>&1 | head -20
```

Expected: the build **fails** with the message from Step 1 naming `/tmp/outside-library` and suggesting `libraryMode: external` — not Eleventy's generic *"Source file is not in the project directory."*

- [ ] **Step 7: Restore your working config and clean up the scratch files**

```bash
mv memex.config.yml.bak memex.config.yml
rm -rf library/scratch _site
git status --short          # expect only eleventy.config.js and the deleted site/_data/site.json
```

If `library/scratch` was your only content under `library/`, remove the now-empty `library/` too. Confirm `git status` shows no stray untracked files before committing.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. Nothing in the suite touches `eleventy.config.js`, so this is a regression check on Tasks 1 and 2.

- [ ] **Step 9: Commit**

```bash
git add eleventy.config.js
git add -u site/_data/site.json
git commit -m "feat(11ty): derive Library serving from memex.config.yml

The passthrough source now comes from cfg.library instead of a hardcoded
site/library, so the example config's own ./library default finally works
— previously process wrote correct Library-relative paths while the build
copied a directory that didn't exist, and every asset URL 404'd.

external mode registers no passthrough at all: the operator's own web
server handles the Library at libraryUrl, so a build or --watch session
never recursive-copies it.

site.libraryPrefix now comes from config instead of site/_data/site.json,
which is deleted — _data files outrank addGlobalData, so leaving it would
have silently overridden the config value."
```

---

### Task 4: Document both modes

**Files:**
- Modify: `memex.config.yml.example`
- Modify: `docs/quickstart.md`
- Modify: `README.md`
- Test: none (documentation).

**Interfaces:**
- Consumes: the field names, defaults, and semantics established in Tasks 1 and 3.
- Produces: nothing consumed by later tasks.

**Note:** `docs/getting-started.md` needs **no edit**. Its `mkdir -p library/fallen-trees` walkthrough was broken before Task 3 and is correct after it — that's the point of deriving the passthrough from config rather than moving the example to `./site/library`.

- [ ] **Step 1: Add the fields to `memex.config.yml.example`**

Leave `library: ./library` exactly as it is. Append after it:

```yaml
# How the Library gets served to the browser.
#   embedded (default) — the Library lives inside this project and Eleventy copies it into
#     _site/library. Simple, and fine at small scale. A build or `--watch` run re-copies the
#     whole thing on every change, so it gets expensive as the Library grows.
#   external — the Library lives wherever you point `library` at, including outside this
#     checkout entirely. Nothing here copies or serves it; that's your web server's job (an
#     nginx `alias`, a CDN, whatever). Set `libraryUrl` to wherever it answers.
libraryMode: embedded

# URL prefix for each Record's asset link. In embedded mode this is a site-root path; in
# external mode it's usually a full origin. A trailing slash is added if you leave it off.
# Record paths that are already absolute (/... or https://...) pass through untouched.
libraryUrl: /library/
```

- [ ] **Step 2: Document the fields in `docs/quickstart.md`**

In the "Install" section, extend the annotated config block (currently three lines, ending with `library: ./library`) to:

```yaml
memexId: memex-nim     # this Memex's identity — stamps originatedBy / addedBy
out: ./site            # where generated Records + Collections (.md) are written
library: ./library     # the Syncthing-shared Library root that `update` scans
libraryMode: embedded  # embedded = Eleventy serves the Library; external = your web server does
libraryUrl: /library/  # URL prefix for asset links (a full origin in external mode)
```

Then add this subsection immediately after the paragraph beginning "`memexId` is required for `process` and `update`":

````markdown
### Embedded vs external Library

`libraryMode` decides who serves your assets.

**`embedded`** (the default) — the Library lives inside this project, wherever `library` points, and Eleventy copies it into `_site/library` at build time. Nothing else to set up. The cost is that a build or a `--watch` session re-copies the whole Library on every change, which stops being free once the Library is large.

**`external`** — the Library lives wherever you want, including on another drive outside this checkout. Memex never reads, copies, or serves those bytes; it only writes URLs that point at them. **You are responsible for serving the Library yourself** — an nginx `alias`, a CDN origin, a static file server, whatever fits. Memex does not set that up or check that it works, so a broken `libraryUrl` shows up as 404s in the browser rather than as a build error.

```yaml
libraryMode: external
library: /mnt/photos/library              # anywhere on disk; never copied
libraryUrl: https://assets.example.com/   # wherever your server answers
```

Both fields are optional. Omit them and you get `embedded` with `/library/`, which is what every config predating these fields already did.
````

- [ ] **Step 3: Note it in `README.md`**

In the "After you process a gallery — view it in the site" section, append a paragraph after the line about `npm run build:site`:

```markdown
By default the site serves your Library itself, copying it into `_site/library` at build time (`libraryMode: embedded`). If your Library is large or already served by another web server, set `libraryMode: external` and point `libraryUrl` at it — Memex then emits asset URLs without ever copying the bytes. See [the quickstart](docs/quickstart.md#embedded-vs-external-library).
```

- [ ] **Step 4: Verify the docs against the implementation**

Re-read the three edited files against `src/config.js` and `eleventy.config.js`. Confirm: field names match exactly (`libraryMode`, `libraryUrl`); the stated defaults match `DEFAULTS`; the trailing-slash claim matches `normalizeLibraryUrl`; the quickstart anchor `#embedded-vs-external-library` matches the heading you added.

- [ ] **Step 5: Commit**

```bash
git add memex.config.yml.example docs/quickstart.md README.md
git commit -m "docs: document embedded and external Library modes

The example's library: ./library default stays as-is — it works now that
the passthrough is derived from config, which also makes the existing
getting-started walkthrough correct as written."
```

---

## Done criteria

- [ ] `npm test` passes.
- [ ] All three build cases in Task 3 verified by hand (embedded/inside, embedded/outside — the bug fix, external), plus the error path.
- [ ] `git status` clean; no scratch files left under `library/` or `_site/`.
- [ ] Branch is `external-library-mode`, four commits, nothing pushed to `main`.
- [ ] No template file (`.njk`) was modified.

## Spec coverage

| Spec section | Task |
|---|---|
| §4.1 new fields, validation, normalization, `saveConfig` | 1 |
| §4.2 Eleventy global data, derived + mode-gated passthrough, delete `site.json` | 3 |
| §4.3 out-of-library warning | 2 |
| §4.4 `memex.config.yml.example` | 4 |
| §4.5 documentation | 4 |
| §5 error handling (invalid mode / embedded-outside-checkout / warn-only) | 1, 3, 2 |
| §6 testing | 1, 2, 3 (manual) |
| §7 migration — Alice's `./site/library` still works | 3 Step 3 (case A) |
