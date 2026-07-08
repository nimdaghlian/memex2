# Memex CLI quickstart

The Memex CLI turns a directory of assets into content-addressed **Records**, a **Collection**, and an in-directory `manifest.json`. It's a pure artifact generator: no OP index, no Oxigraph, no network, no running 11ty. Hash bytes in, `.md` and JSON out.

This covers Wave 1 — `process`, `update`, `verify`. The OP-index push and the human 11ty site are later waves.

## Install

```sh
npm install
cp memex.config.yml.example memex.config.yml
```

Then open `memex.config.yml` and set `memexId` to this machine's identity:

```yaml
memexId: memex-nim     # this Memex's identity — stamps originatedBy / addedBy
out: ./site            # where generated Records + Collections (.md) are written
library: ./library     # the Syncthing-shared Library root that `update` scans
```

`memexId` is required for `process` and `update` because it records *which Memex introduced an asset*. It's machine identity, not a secret — secrets belong in `.env`. The live `memex.config.yml` is gitignored because it's per-machine.

## Installing the `memex` command

The examples below use `node bin/memex.js`. To type just `memex` instead, pick one of these. All three work; they differ in who manages the binding.

**`npm link` — the standard npm way.** From the repo root:

```sh
npm link
```

This puts a `memex` command on your PATH, managed by npm. Undo it with `npm unlink -g memex2`. Use this unless you have a reason not to.

**A symlink into your PATH — live and version-independent of npm.** Point a name on your PATH at the script:

```sh
ln -sf "$(pwd)/bin/memex.js" ~/.local/bin/memex   # any bin dir on your PATH
```

Because it's a symlink to the repo, edits to the source apply immediately. If you use nvm, note that node's bin dir is version-specific — a symlink placed there won't follow a `nvm use` to another version.

**A shell alias — simplest, survives node version switches.**

```sh
echo 'alias memex="node '"$(pwd)"'/bin/memex.js"' >> ~/.zshrc && source ~/.zshrc
```

The tradeoff: aliases only exist in interactive shells, so scripts and other tools won't see `memex`.

Whichever you choose, `memex` reads `memex.config.yml` from your **current directory**, not from where the script lives. Run it from your Memex project root, or pass `--config /path/to/memex.config.yml` from anywhere.

## Interactive mode

Run `memex` with no arguments to launch a menu-driven wizard — handy for onboarding or when you'd rather not remember flags:

```sh
memex
```

```
  1) Process a directory
  2) Tag a directory
  3) Update from peers
  4) Verify a directory
  5) Create config
  6) Help
  7) Quit
```

Each choice walks you through the same work the subcommands do. **Create config** (5) is the first-run step: it writes `memex.config.yml` (prompting for `memexId`, `out`, `library`) and applies it immediately, so you can process a directory in the same session. Process/tag/verify let you pick a directory from your Library by number, or type any path.

## Five-minute walkthrough

Drop some images into a directory under your Library, then process it:

```sh
node bin/memex.js process library/fallen-trees
```

```
  → added: IMG_1758_122322.jpeg, belmont-is-closed_011824.jpeg
  ✓ process: 2 record(s), 1 collection, manifest updated
```

Three things now exist:

**`library/fallen-trees/manifest.json`** — the machine-readable ledger, written *inside* the asset directory so it syncs with the assets:

```json
{
  "version": 1,
  "originatedBy": "memex-nim",
  "items": [
    {
      "path": "IMG_1758_122322.jpeg",
      "hash": "5c15fbecd08ce15087cf907e3d8e6c4852e99475cd62767805de16af5ee2c7c6",
      "ni": "ni:///sha-256;XBX77NCM4VCHz5B-PY5sSFLplHXNYnZ4Bd4Wr17ix8Y",
      "mimetype": "image/jpeg",
      "byteSize": 3243488,
      "width": 4032,
      "height": 3024,
      "dateCreated": "2022-12-23",
      "uploadDate": "2026-07-07T23:41:55.074Z"
    }
  ]
}
```

**`site/items/img-1758-122322.md`** — one Record per asset:

```yaml
---
title: IMG_1758_122322.jpeg
item: ni:///sha-256;XBX77NCM4VCHz5B-PY5sSFLplHXNYnZ4Bd4Wr17ix8Y
schema:sha256: 5c15fbecd08ce15087cf907e3d8e6c4852e99475cd62767805de16af5ee2c7c6
schema:contentUrl: /assets/fallen-trees/IMG_1758_122322.jpeg
schema:image: /assets/fallen-trees/IMG_1758_122322.jpeg
schema:encodingFormat: image/jpeg
schema:contentSize: 3243488
schema:width: 4032
schema:height: 3024
schema:dateCreated: "2022-12-23"
schema:uploadDate: "2026-07-07T23:41:55.074Z"
memex:addedBy: memex-nim
tags: []
---
```

**`site/collections/fallen-trees.md`** — one baseline Collection for the directory, its body a `[[wikilink]]` to each Record:

```markdown
---
title: fallen-trees
memex:addedBy: memex-nim
tags: []
---

- [[img-1758-122322]]
- [[belmont-is-closed-011824]]
```

Now curate. Edit the Record `.md` files in Obsidian (or any editor): add prose, `tags`, and `[[wikilinks]]` to build your own groupings. The generated files are yours to change.

Check integrity any time:

```sh
node bin/memex.js verify library/fallen-trees
```

```
  ✓ verify: clean
```

## The model in brief

- **Item** — the raw bytes. Identity is `ni:///sha-256;<base64url>` (RFC 6920), machine-independent, the join key across Memexes. It asserts nothing itself.
- **Record** — a `.md` file describing one Item. Every statement is outbound from here. The hash appears twice on purpose: `item` (the `ni:` node, the Item edge) and `schema:sha256` (the hex literal you can query and read). Don't collapse them.
- **Collection** — a Record whose value *is* its link set. One per processed directory. Membership is just "there's a link."

The category (image/video/audio/document) is **not** stored. It's derived from `schema:encodingFormat` at render time, so there's nothing to drift.

## Command reference

### `process <dir>`

Hash a directory's assets, write `manifest.json` into the directory, and generate Records plus one baseline Collection.

```sh
node bin/memex.js process <dir> [options]
```

| Option | Default | Effect |
|---|---|---|
| `--out <dir>` | config `out` | Where Records/Collections are written. |
| `--config <file>` | `./memex.config.yml` | Config file path. |
| `--overwrite` | off | Replace existing `.md` files instead of skipping them. |
| `--no-parse-date` | date parsing on | Skip deriving `schema:dateCreated` from filenames. |
| `--tag <tag>` | none | Seed a tag on every Record and the Collection. Repeatable: `--tag a --tag b`. |

Behavior worth knowing:

- **Presence of `manifest.json` is the tracked/untracked boundary.** A directory with no manifest is invisible scratch space — rename and cull freely until you process it.
- **Re-running is incremental and idempotent.** New files get Records and manifest entries; existing files are left alone. With `--overwrite` off (the default), curated Records and Collections are never clobbered.
- **A baseline Collection is generated once.** Because you'll edit it, `process` won't rewrite an existing Collection. Assets you add on a later run land as Records but aren't auto-appended to the Collection — add those `[[wikilinks]]` yourself, or re-run with `--overwrite` to regenerate the baseline (discarding edits).
- **Basenames are stable.** A Record's filename is a slug of the asset filename, and it's the wikilink resolution key, so it stays put across runs. If two different-content files slug to the same name, both get a short hash suffix and a warning — no silent overwrite.
- **Intrinsic facts are computed in one pass** over the bytes: hash, MIME, byte size, and image dimensions (JPEG/PNG/GIF). A dimension that can't be read is omitted, not guessed.

### `tag <dir>`

Add tags to every Record of an already-processed directory. Use this to tag after the fact — `process --tag` seeds tags at generation time; `tag` edits the Records you already have.

```sh
node bin/memex.js tag <dir> --tag <tag> [--tag <tag> ...]
```

| Option | Default | Effect |
|---|---|---|
| `--tag <tag>` | required | Tag to add. Repeatable. |
| `--out <dir>` | config `out` | Where the Records live. |
| `--config <file>` | `./memex.config.yml` | Config file path. |

Behavior worth knowing:

- **Run it after `process`.** It edits the generated `.md` documents, not the assets. Without a `manifest.json` in the directory it errors — there's nothing to tag yet.
- **Scoped to that directory.** Records are matched to the directory by content hash (each Record's `schema:sha256` against the directory's manifest), so Records from other directories are untouched. Hash-matching is rename-safe.
- **Body-preserving and additive.** Your curated prose and `[[wikilinks]]` are kept. Tags merge (deduplicated), so running it twice adds nothing new. It only tags the item Records, not the Collection.

### `update`

Scan the Library for manifests other Memexes wrote and generate baseline Records for any assets you don't yet track.

```sh
node bin/memex.js update [options]
```

| Option | Default | Effect |
|---|---|---|
| `--library <dir>` | config `library` | Library root to scan. |
| `--out <dir>` | config `out` | Where Records/Collections are written. |
| `--config <file>` | `./memex.config.yml` | Config file path. |
| `--overwrite` | off | Replace existing `.md` files. |

Behavior worth knowing:

- **Only peers' manifests count.** Manifests whose `originatedBy` is your `memexId` are skipped — those are already yours.
- **"Tracked" means you have a Record for that hash.** `update` reads the `schema:sha256` of every Record in `out/items` and generates baselines only for hashes it doesn't find.
- **`addedBy` reflects the origin.** Each generated Record's `memex:addedBy` is the peer who introduced the asset, not you.
- **Idempotent and diff-based.** Re-running writes nothing new, and it picks up a peer's incremental adds (new items in an updated peer manifest) on the next run.
- **One-way and simple.** No conflict resolution, no write-back. `update` never touches a peer's directory or manifest.

### `verify <dir>`

Compare a processed directory against its `manifest.json` and report drift. Warn-only — it never fails.

```sh
node bin/memex.js verify <dir>
```

It reports four kinds of drift, then exits 0 regardless:

| Warning | Means |
|---|---|
| `changed` | A tracked path's bytes changed (new hash for a known path). |
| `renamed` | A tracked file moved — same bytes, new path. |
| `deleted` | A tracked path is gone and its bytes aren't anywhere in the directory. |
| `stray` | An untracked asset is present (not in the manifest). |

Exit code stays success because the hash-in-manifest anchor means drift is *surfaced*, never silently corrupting the graph. Fix drift by re-running `process` (to acknowledge intended changes) or restoring the assets. Auto-rewriting renamed wikilinks is a v2 feature; v1 warns.

Wire it into an 11ty `before` hook later to surface integrity at build time.

## Tests

```sh
npm test        # node --test across test/**/*.test.js
```

## What this wave excludes

- Pushing Records to the OP index (the deferred seam — needs the OP Markdown handler, octothorp.es #238).
- The 11ty human site and wikilink rendering.
- Federation — remote SPARQL queries across Memexes. Local-first by design; this comes dead last.

See [`specs/2026-07-07-memex2-client-design.md`](specs/2026-07-07-memex2-client-design.md) for the full design and [`memex2-op-core-dependencies.md`](memex2-op-core-dependencies.md) for the OP-core work these artifacts feed.
