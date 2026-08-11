# Memex 2.0 — `memex retag`

> **Status: DRAFT, approved for implementation planning.** Authored 2026-08-10, from a design conversation that started with a real failure: two tags in the live Library, `materialist methods` (24 Records) and `materialist_methods` (1 Record), slug to the same `materialist-methods` and collided on `/tags/<tag>/`, which broke the Eleventy build outright. That instance was fixed by hand; this spec exists so the next one doesn't need to be.

## 1. Purpose & scope

`memex tag <dir> a,b` adds tags. There is no way to remove one, and no way to change one. A tag typo is therefore permanent unless the curator opens every affected `.md` by hand — 25 files, in the case above.

This spec adds **`memex retag`**: a global find-and-fix pass over the tag arrays of every Record and Collection under `out`.

```sh
memex retag --rename 'materialist_methods' 'materialist methods'
memex retag --remove 'draft'
```

**Out of scope:** tag *addition* (that's `memex tag`, unchanged); any notion of a tag registry, tag metadata, or tag hierarchy; renaming tags on peers' Memexes (Records are local, per the client design spec §6).

## 2. Current behavior (baseline)

- `src/commands/tag.js` (`runTag`) walks `itemsDir(out)` only, matches Records to a directory's assets by content hash (`niToHex(frontmatter.item)` against the manifest's hashes), and calls `mergeTags` — which by construction **only ever adds** (`src/record.js`: *"A curator's own tags always survive; this only ever adds."*).
- `src/record.js` provides the pieces this needs already: `parseRecord` splits frontmatter from the curator-owned body, `serializeRecord` puts them back. `runTag` uses both, so editing a Record in place without destroying prose is an established pattern.
- Collections carry tags too — `buildCollection` writes `{ title, tags }` frontmatter, and 14 Collections in the live Library have non-empty `tags`. `runTag` never touches them; a directory-scoped tag operation structurally can't.
- `keyOf()` in `site/_lib/wikilinks.js` and `slug()` in `src/basename.js` apply the same normalization (`toLowerCase`, non-alphanumerics → `-`, trim). `site/tags.njk` paginates on the raw tag strings and slugs them for the permalink, which is why two distinct raw tags can land on one output path.

## 3. Design

### 3.1 Command surface

```sh
memex retag --rename <old> <new>   # every occurrence of <old> becomes <new>
memex retag --remove <tag>         # every occurrence of <tag> is dropped
memex retag --remove <tag> --dry-run
```

| Option | Effect |
|---|---|
| `--rename <old> <new>` | Replace the tag `<old>` with `<new>` wherever it appears. |
| `--remove <tag>` | Drop the tag `<tag>` wherever it appears. |
| `--dry-run` | Report what would change; write nothing. |
| `--out <dir>` | Record/Collection output dir (overrides config), matching every other command. |
| `--config <file>` | Config file path, matching every other command. |

`--rename` and `--remove` are mutually exclusive, and exactly one is required. Both take tag values verbatim, so a tag containing spaces just needs shell quoting — no comma-splitting, because unlike `memex tag` this operates on exactly one tag at a time. That's deliberate: a bulk tag rewrite is a destructive operation and the one-at-a-time shape keeps the blast radius legible.

### 3.2 Scope: global, Records and Collections

`retag` walks **both** `<out>/items/` and `<out>/collections/`. Collections are Records too (client design spec §3) and 14 of them carry tags today; a rename that skipped them would leave the Library in exactly the inconsistent state this command exists to repair.

There is no `<dir>` argument. A tag is a Library-wide concept — it isn't scoped to a processed directory the way `memex tag <dir>` is, and the motivating collision spanned two shelves.

### 3.3 Matching is exact, not slug-normalized

`--rename 'materialist_methods' 'materialist methods'` matches the literal string `materialist_methods`. It does **not** match `Materialist Methods` or `materialist-methods`.

This is the right default precisely because of the motivating bug: those two tags *are* different strings that happen to share a slug. Slug-normalized matching would make `--rename` unable to distinguish the two things the curator is trying to distinguish. Exact matching means `retag` can always express the fix; a curator who wants a case-insensitive sweep runs the command twice.

### 3.4 Merge semantics

Renaming onto a tag that a Record already has **merges** rather than duplicating. A Record tagged `['materialist_methods', 'materialist methods']` becomes `['materialist methods']`, not `['materialist methods', 'materialist methods']`.

Tag order is otherwise preserved: the renamed tag keeps the position of the tag it replaced. Removing a tag closes the gap. A Record whose tags become empty gets `tags: []`, never a missing key — `buildFrontmatter` always writes the key, and templates read it unconditionally.

### 3.5 Files with nothing to change are not rewritten

A Record that doesn't carry the target tag is left untouched on disk — no rewrite, no mtime change. This matters because the Library is Syncthing-shared: rewriting 400 unchanged files would push 400 pointless syncs to every peer. `runTag` already establishes this behavior (*"nothing new — leave the file untouched"*).

### 3.6 New module and shared helper

**`src/commands/retag.js`** exports:

```js
runRetag({ out, rename, remove, dryRun = false })
// rename: [oldTag, newTag] | null
// remove: tagString | null
// → { changed: number, files: string[], skipped: number }
```

`files` holds the `out`-relative paths of every file that changed (or would change, under `--dry-run`), so the CLI can print them.

**`recordFiles(out)` is added to `src/generate.js`** — returns absolute paths of every `.md` under `itemsDir(out)` and `collectionsDir(out)`, skipping directories that don't exist. It belongs there because `generate.js` already owns `itemsDir`/`collectionsDir` and the statement *"the on-disk name IS the stable basename."* The `memex rename` spec (`2026-08-10-memex-rename-design.md`) needs the same walker for wikilink rewriting; whichever of the two lands first defines it.

### 3.7 CLI wiring

A new `program.command('retag')` in `bin/memex.js`, following the existing shape: build config via `config(opts)`, call the runner, report through `ok()`/`info()` from `src/output.js`, and `err()` + `process.exit(1)` on throw. No `requireMemexId` — `retag` edits existing local Records and stamps no identity.

Output:

```
  → site/items/claude-le-vi-strauss-the-savage-mind.md
  ✓ retag: 1 file(s) updated
```

Under `--dry-run` the summary line reads `retag: 1 file(s) would be updated (dry run)`.

**Interactive wizard integration is out of scope.** Every current wizard entry is built around picking a directory (`pickDirectory` in `src/interactive.js`), and `retag` is global by design. Adding it means designing a tag-picker, which is its own small piece of work and shouldn't block the command.

## 4. Error handling

- Neither `--rename` nor `--remove` given, or both → throw before touching anything, naming the two options.
- `--rename` with an empty or whitespace-only `<new>` → throw. Removing a tag is `--remove`; renaming to nothing is almost certainly a quoting mistake.
- `<old>` matches nothing → **not** an error. Report `retag: 0 file(s) updated` and exit 0, so the command is safely idempotent and re-runnable in a script.
- `<out>/items/` or `<out>/collections/` missing → treated as empty, not an error. A Memex may legitimately have no Collections yet.
- A `.md` that `parseRecord` can't split (no frontmatter) → skipped and counted in `skipped`; the CLI reports the count so silent no-ops are visible. These are hand-authored notes, not Records, and mangling them would be worse than ignoring them.
- A Record whose `tags` is present but not an array (hand-edited to a string) → skipped and counted, same as above. Coercing is guesswork.

## 5. Testing

Back-end logic only; nothing asserts on templates or rendered markup.

- `test/retag.test.js` — new suite over `runRetag`, against a scratch `out` built with `mkdtempSync`:
  - `--rename` rewrites the tag in a Record and in a Collection (proves both directories are walked).
  - Renaming onto a tag the Record already has merges instead of duplicating.
  - The renamed tag holds its position in the array.
  - `--remove` drops the tag; a Record left with none gets `tags: []`.
  - A Record without the target tag is not rewritten — assert on unchanged mtime or unchanged bytes.
  - The curator-owned body (prose plus `[[wikilinks]]`) survives a rewrite verbatim.
  - `--dry-run` reports the same `files` list but leaves every byte on disk unchanged.
  - A tag matching nothing returns `{ changed: 0 }` and does not throw.
  - A `.md` with no frontmatter is skipped and counted, not mangled.
  - Exact matching: `--rename 'a_b' 'a b'` leaves a Record tagged `A_B` alone.
- `test/generate.test.js` (or the existing suite covering `generate.js`) — `recordFiles(out)` returns both Records and Collections, and returns `[]` when neither directory exists.
- `test/cli.e2e.test.js` — one end-to-end case: `process` a scratch directory with `--tag old`, then `retag --rename old new`, then assert the Record's frontmatter carries `new`.

## 6. Migration notes

No migration. `retag` is additive — a new command that reads and rewrites files already on disk in a format it doesn't change. Nothing about `process`, `tag`, `update`, or `verify` moves.

The Library is Syncthing-shared, so a `retag` run propagates to peers as ordinary file edits. Records are local per Memex (client design spec §6): renaming a tag here does not rename it on a peer's Records, and shouldn't. Two Memexes can legitimately tag the same Item differently.
