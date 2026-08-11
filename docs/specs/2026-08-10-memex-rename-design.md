# Memex 2.0 — `memex rename` and `memex reconcile`

> **Status: DRAFT, approved for implementation planning.** Authored 2026-08-10, from a design conversation prompted by a real defect in the live Library: ten PDFs in one shelf carry a literal `...` in their filenames, truncated at exactly 47 characters by whatever downloaded them (`saidiya-hartman-wayward-lives-beautiful-experim... copy.pdf`). Four were later renamed by hand to strip the author's first name, carrying the `...` along. Memex reproduces these names faithfully — the ellipsis is in the bytes on disk, not introduced by the CLI or by Eleventy. Fixing them by hand is what this spec exists to prevent.

## 1. Purpose & scope

Renaming an asset by hand today is a trap. The filename is load-bearing in five places, and a Finder rename updates none of them:

1. `manifest.json` — the item's `path`.
2. The Record's `path:` frontmatter.
3. The Record's `title:`, derived from the filename by `process`.
4. The Record's **own filename**, `<out>/items/<slug(filename)>.md` — which is the `[[wikilink]]` resolution key.
5. Every `[[wikilink]]` and Collection membership line pointing at that basename.

Worse, the drift is silent and compounding. `mergeManifest` keys on `path` (`src/manifest.js`), so a re-`process` after a hand rename treats the new name as a brand-new file: it appends a second manifest entry, resets `uploadDate` to now, and writes a **second Record** under the new slug. The old Record lingers, still pointing at a path that no longer exists.

This spec adds two commands:

- **`memex rename`** — rename the asset, then cascade all five updates.
- **`memex reconcile`** — adopt a rename already made in Finder, Obsidian, or anywhere else, then run the same cascade.

They are one engine with two triggers. `rename` knows the old and new names because it performs the move; `reconcile` learns them by content hash from `verify`.

**Out of scope:** renaming a *directory* (that would rename a Collection and every member's `path` prefix — a bigger operation with different failure modes, worth its own spec); renaming Records without renaming the underlying asset; propagating a rename to peers' Memexes (Records are local, per the client design spec §6 — a peer's `reconcile` will adopt the change from the synced bytes on its own).

## 2. Current behavior (baseline)

- `src/commands/process.js` derives everything name-shaped from the filename: `title: stripExt(a.filename)`, `path: relative(library, join(dir, a.filename))`, and the Record's on-disk name from `allocateBasenames` → `slug(stripExt(filename))`.
- `src/basename.js` states the constraint this spec has to respect: the basename *"is the wikilink resolution key (spec §5): it must be STABLE across re-runs. We derive it from the filename slug alone, so it depends on nothing but the file."* Stable **given the filename** — so changing the filename necessarily changes the key, and something has to rewrite the links.
- `src/commands/verify.js` already detects renames exactly as needed: a manifest path that's gone, whose hash is present under a different filename, yields `{ type: 'renamed', from, to, hash }` (`verify.js:45`). It's warn-only and changes nothing. `reconcile` is this detection plus the cascade.
- `src/commands/tag.js` establishes the pattern for finding a Record from an asset: match `niToHex(frontmatter.item)` against the manifest hash. This is rename-safe by construction and is how both new commands will locate Records.
- `src/record.js` gives `parseRecord`/`serializeRecord`, already used by `runTag` to edit a Record in place without disturbing the curator-owned body.
- `site/_lib/wikilinks.js` defines `keyOf(label)` — the same normalization as `slug()`. `[[Fallen Trees]]` and `[[fallen-trees]]` resolve to the same Record. Link rewriting must therefore match on the *key*, not on literal text. There is no `[[target|display]]` syntax: `resolveWikilinks` uses the captured label as both the lookup key and the anchor text.

## 3. Design

### 3.1 Command surface

```sh
memex rename <dir> <old-filename> <new-filename>       # single
memex rename <dir> --replace '...' ''                  # batch over the directory
memex rename <dir> --replace '...' '' --dry-run        # print the plan, write nothing
memex reconcile <dir>                                  # adopt external renames
memex reconcile <dir> --dry-run
```

| Option | Effect |
|---|---|
| `--replace <find> <with>` | Batch mode. Every asset in `<dir>` whose filename contains `<find>` is renamed with the first occurrence replaced by `<with>`. |
| `--dry-run` | Print the planned renames and exit. Nothing on disk changes. |
| `--yes` | Skip the confirmation prompt (for scripts). |
| `--out <dir>` | Record/Collection output dir, overriding config. |
| `--config <file>` | Config file path. |

`<find>` is a **literal substring, not a regex.** The motivating case is `...`, which as a regex means "any three characters" — the single most dangerous possible misreading. Curators who want regex can rename one at a time.

Batch mode always prints the full plan and asks for confirmation before touching anything:

```
  → saidiya-hartman-wayward-lives-beautiful-experim... copy.pdf
    → saidiya-hartman-wayward-lives-beautiful-experim copy.pdf
  → war-and-cinema-the-logistics-of-perception-by-p... copy.pdf
    → war-and-cinema-the-logistics-of-perception-by-p copy.pdf
  10 rename(s). Proceed? [y/N]
```

Single-file mode does not prompt: the curator typed both names explicitly.

### 3.2 The cascade

Both commands converge on one function. Given `{ dir, oldFilename, newFilename, out, library }`:

1. **Rename the asset on disk** (`rename` only — under `reconcile` the move already happened).
2. **Update the manifest entry in place.** Find the item by `path === oldFilename`, set `path = newFilename`, and **preserve `hash`, `ni`, `uploadDate`, `dateCreated`, and every intrinsic**. This is the step that makes the whole command worth having: it's what a hand rename gets wrong, and it's why `uploadDate` survives.
3. **Locate the Record by content hash.** Walk `itemsDir(out)`, match `niToHex(frontmatter.item)` against the manifest item's `hash`. Not by filename — that's the thing changing.
4. **Update the Record's `path:`** to the new library-relative path.
5. **Update `title:` only if it's still CLI-derived** (§3.3).
6. **Rename the Record file** from `<old-slug>.md` to `<new-slug>.md`.
7. **Rewrite `[[wikilinks]]`** across every Record and Collection (§3.4).

Order matters: the manifest is updated before Records are located, because the manifest hash is the lookup key. If step 1 succeeds and a later step throws, the run aborts with the completed steps reported, so the curator can see exactly how far it got. Full transactionality across a filesystem rename and N file writes isn't achievable without a staging area, and the failure is recoverable — `reconcile` re-run against the same directory picks up where it stopped, because it derives its work from on-disk state rather than from memory of the plan. **That recoverability is the reason `reconcile` exists as a first-class command rather than a flag.**

### 3.3 `title:` follows only when the curator hasn't touched it

If the Record's `title:` equals `stripExt(oldFilename)` — exactly what `process` would have written — it's CLI-derived and gets regenerated as `stripExt(newFilename)`. If it differs, a human wrote it, and it is left alone.

This gives the right outcome for the motivating case at no cost: those ten Records have untouched titles like `hartman-wayward-lives-beautiful-experim...`, so cleaning the filename cleans the title automatically. A curator who has written a real title (`Wayward Lives, Beautiful Experiments`) keeps it.

### 3.4 Wikilink rewriting, and the label it costs

Every `.md` under `<out>/items/` and `<out>/collections/` is scanned. Any `[[label]]` whose `keyOf(label)` equals the **old** basename is rewritten to `[[<new-basename>]]`.

Matching on the key rather than the literal text is required for correctness — `[[Hartman Wayward Lives]]`, `[[hartman-wayward-lives]]`, and `[[ Hartman  Wayward  Lives ]]` all resolve to the same Record today, and all must be caught.

The cost: **the label text is replaced.** Since `resolveWikilinks` uses the label as both key and anchor text, and there's no piped-display syntax, there is no way to keep a prettier display form while changing the target. When a rewritten label wasn't literally the old basename, the command warns and names the file:

```
  ! site/collections/michaels-shelf.md: link label "Hartman Wayward Lives" replaced with "hartman-wayward-lives-beautiful-experiments"
```

so the curator can restore any display text they cared about. Adding `[[target|display]]` support to the resolver would remove this cost entirely and is a reasonable follow-up, but it changes the wikilink contract and belongs in its own spec.

Files with no matching link are not rewritten — no mtime churn on a Syncthing-shared tree.

### 3.5 `reconcile`

`runReconcile({ dir, out, library, dryRun })` calls `runVerify({ dir })`, takes every `{ type: 'renamed', from, to }` warning, and runs the cascade for each with step 1 skipped.

Other warning types are reported but not acted on. `changed` (same path, different bytes) is a genuine content edit, `deleted` and `stray` need a human decision, and guessing at any of them risks data loss. `reconcile` fixes exactly the unambiguous case: same bytes, different name.

If `verify` reports no renames, `reconcile` reports `reconcile: nothing to adopt` and exits 0.

### 3.6 New modules

**`src/rename-cascade.js`** — the shared engine, deliberately not under `commands/` because both commands consume it:

```js
applyRename({ dir, out, library, oldFilename, newFilename, moveFile, dryRun })
// moveFile: true for `rename`, false for `reconcile` (the move already happened)
// → { manifestUpdated, recordFrom, recordTo, titleUpdated, linksRewritten, labelWarnings }
```

**`src/commands/rename.js`** — `runRename({ dir, out, library, oldFilename, newFilename, replace, dryRun })`. Resolves the single-vs-batch plan, then calls `applyRename` per file. Returns `{ renamed: number, plan: [{from, to}], warnings }`.

**`src/commands/reconcile.js`** — `runReconcile({ dir, out, library, dryRun })` as described in §3.5.

**`recordFiles(out)` added to `src/generate.js`** — every `.md` under `itemsDir(out)` and `collectionsDir(out)`, skipping absent directories. Needed for §3.4. The `memex retag` spec (`2026-08-10-memex-retag-design.md`) defines the same helper; whichever lands first adds it.

### 3.7 CLI wiring

Two new `program.command(...)` blocks in `bin/memex.js`, following the existing shape: `config(opts)`, call the runner, report via `ok()`/`info()`/`warn()`, `err()` + `process.exit(1)` on throw. Neither needs `requireMemexId` — both edit existing local artifacts and stamp no identity.

`formatWarning` in `bin/memex.js` already renders `renamed` warnings (`${w.from} → ${w.to}: renamed (same bytes)`), so `reconcile`'s dry-run output reuses it.

**Interactive wizard integration is out of scope**, for the same reason as in the retag spec: it's a natural follow-up but shouldn't gate the commands.

## 4. Refusals — what aborts before touching anything

Every check runs against the **whole plan** before the first byte moves, so a batch either starts clean or doesn't start.

- **Not a directory**, or no `manifest.json` → throw. An unprocessed directory is *"invisible scratch space — rename and cull freely"* (quickstart), so there's nothing to cascade and the curator should just use `mv`.
- **`<old-filename>` not in the manifest** → throw, naming it. Either a typo or an unprocessed asset.
- **`<new-filename>` already exists on disk** → throw. Never silently clobber an asset.
- **Two renames in one batch targeting the same new name** → throw, naming both sources.
- **`slug(stripExt(newFilename))` collides with an existing Record that isn't this one** → throw. Two assets whose names slug identically would merge into one Record and one wikilink key, silently losing a Record. `allocateBasenames` disambiguates this at `process` time with a `-2` suffix, but doing that here would produce a Record name that doesn't match the filename — the exact drift this command exists to eliminate. Better to refuse and let the curator pick a different name.
- **`<new-filename>` contains a path separator** → throw. This command renames within a directory; moving between directories changes the `path` prefix and the owning Collection, which is directory-rename territory (out of scope, §1).

## 5. Error handling (non-fatal)

- **The Record's `path:` doesn't match `<old-filename>`.** Possible when two assets share bytes: duplicates collapse to one Record (`process.js`: *"one per distinct basename (content-addressed duplicates collapse)"*), whose `path:` names only one of them. The rename and manifest update proceed; the Record's `path:` is left alone and a warning names the file. Rewriting it would repoint the Record at a different asset than the curator renamed.
- **No Record found for the manifest hash.** The manifest is updated, a warning is emitted, processing continues. A missing Record is a `process` job, not a rename failure.
- **A `.md` that `parseRecord` can't split** → skipped, counted, reported. Hand-authored notes aren't Records.
- **Unresolvable wikilinks elsewhere in the tree** → untouched. `resolveWikilinks` already reports them as Eleventy build warnings; this command only rewrites links that currently point at the renamed Record.

## 6. Testing

Back-end logic only; nothing asserts on templates or rendered markup.

- `test/rename-cascade.test.js` — over `applyRename`, against a scratch library + `out` built with `mkdtempSync`:
  - The manifest entry's `path` changes while `hash`, `ni`, `uploadDate`, and `dateCreated` are preserved. **This is the regression the command exists for** — assert `uploadDate` explicitly.
  - The Record file is renamed old-slug → new-slug, and its `path:` is updated.
  - `title:` updates when it equals `stripExt(oldFilename)`; a hand-edited title is left alone.
  - `[[oldslug]]` in another Record and in a Collection's membership list both become `[[newslug]]`.
  - A `[[Pretty Label]]` whose `keyOf` matches is rewritten, and a label warning is returned naming the file.
  - The curator-owned body around a rewritten link survives verbatim.
  - A file containing no matching link is not rewritten (unchanged bytes).
  - `moveFile: false` leaves the filesystem alone but performs every other step.
- `test/rename.test.js` — over `runRename`:
  - Batch `--replace '...' ''` renames every matching asset and no others.
  - `<find>` is literal: `--replace '...' ''` does **not** match `abc.pdf`. This is the regex-misreading guard.
  - `--dry-run` returns the full plan and changes nothing on disk.
  - Each refusal in §4 throws before any file moves — assert the directory is byte-identical afterward.
- `test/reconcile.test.js` — over `runReconcile`:
  - An out-of-band `renameSync` on an asset is detected and fully cascaded.
  - `changed`, `deleted`, and `stray` warnings are reported but not acted on.
  - A clean directory yields `{ renamed: 0 }` and does not throw.
  - Re-running after an interrupted cascade completes the remaining work (the recoverability claim in §3.2).
- `test/cli.e2e.test.js` — one case per command through the real binary: `process` a scratch directory, `rename` an asset, then `verify` reports clean; and `process`, `renameSync` by hand, `reconcile`, then `verify` reports clean. `verify` returning clean is the strongest available end-to-end assertion that the cascade left no drift.

## 7. Migration notes

No migration and no breaking change. Both commands are additive; `process`, `tag`, `update`, and `verify` are untouched, as are the manifest format and the Record contract.

The live Library's ten `...` files are the first intended use:

```sh
memex rename "site/library/Michael's Shelf" --replace '...' '' --dry-run
```

A literal empty replacement handles most of them cleanly — `hartman-wayward-lives-beautiful-experim....pdf` becomes `hartman-wayward-lives-beautiful-experim.pdf`, because the four dots are the ellipsis plus the extension separator. But three leave debris:

```
waldby-the-visible-human-project_-informa... .pdf  →  waldby-the-visible-human-project_-informa .pdf
braidotti-posthuman-ecologies-complexity-a... .pdf →  braidotti-posthuman-ecologies-complexity-a .pdf
giannachi-archive-everything-mapping-... copy.pdf  →  giannachi-archive-everything-mapping- copy.pdf
```

A trailing space before the extension, and a trailing dash. Both are legal filenames and neither breaks anything, but neither is what the curator wanted. This is a real limitation of literal substring replacement, not a bug — and the point is that `--dry-run` surfaces it *before* ten files move, so those three can get an explicit single-file rename instead. **That's the whole argument for batch mode defaulting to a printed, confirmed plan.**

Because the Library is Syncthing-shared, renames propagate to peers as file moves. A peer's Records still point at the old names until that peer runs `reconcile` — which is exactly the workflow `reconcile` is designed for, and the reason it detects renames from on-disk state rather than from any record of who initiated them.
