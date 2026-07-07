# Wave 1 — The Memex CLI (asset → contract artifacts)

> **Actionable wave plan.** Build the Memex CLI: a pure artifact generator that turns a directory of assets into content-addressed Records, a Collection, and an in-directory `manifest.json`. **Independent of OP core** — needs no OP, Oxigraph, network, or running 11ty. It is first in the pipeline and *hardens the contract* that OP core deps #237/#238 must consume.
>
> **Substrate:** `docs/specs/2026-07-07-memex2-client-design.md` (§2 identity, §4 vocab/documentRecord, §5 wikilink resolution, §6 manifest/processing, §7 CLI surface). **Reuses** the `make-gals` modules (copied into this repo by the maintainer).
>
> **Not blocked by:** OP core #237 (documentRecord projection) or #238 (Markdown handler). The only cross-seam step — pushing records to OP — is explicitly deferred (see Seam).

## Why this wave is independent and first

The CLI reads bytes and writes files. Its entire output is a **file-based contract** (`.md` + `manifest.json`); nothing at runtime touches OP. Building it first:
- **Pins the contract** (frontmatter shape, manifest schema, stable-basename rule) that #237/#238 consume — de-risking the harder core work by giving it a concrete, tested input instead of a spec.
- **Produces the exact fixtures** #238's integration phase needs ("a small `.md` set").
- Is **fully testable in isolation** against a fixtures directory (`node --test`, as `make-gals` already does).

## The seam (what this wave deliberately excludes)

```
[ asset bytes ] ─CLI WAVE─▶ hash → frontmatter → manifest.json → Record/Collection .md   ── the CONTRACT
                                                    │
                                       SEAM ────────┘  "push records to OP index"  (deferred; needs #238)
```

**Excluded** (post-wave / need OP running): the OP-index push, the coverage index (reads OP curation state), federation, and OP-API-fed feeds. **Included as a parallel track:** 11ty scaffold + human-site wikilink rendering (independent of OP; separable if you want the wave tighter).

## Reuse map (from `make-gals`, copied into `memex2`)

| Reuse mostly as-is | Extend | Net-new |
|---|---|---|
| `slug.js`, `output.js`, `config.js`, `gallery.js`, `resolve.js`, `render.js`, `date.js`, `interactive.js`, `bin/make-gals.js` (→ `bin/memex.js`) | `scan.js` (add byte read for hashing), `index.js` (the process pipeline), `templates/*` (→ schema.org frontmatter) | `hash.js` (ni: + hex + intrinsics), `manifest.js`, `commands/{process,update,verify}.js`, stable-basename rule, Collection-as-`[[wikilinks]]` generation |

## Phases

### Phase 1 — Hashing + intrinsic facts (`hash.js`) — the keystone
Everything keys off this; build first.
- SHA-256 over file bytes → **hex** (permalink id) and **`ni:///sha-256;<base64url>`** (Item URI). One helper, both encodings, plus a converter between them.
- Extract intrinsic facts in the same pass where cheap: `mimetype` (`schema:encodingFormat`), `byteSize` (`schema:contentSize`), and — via a light probe — `width`/`height` (images) and `duration` (a/v). Keep the media-probe dependency minimal and optional (degrade gracefully if a dimension can't be read).
- **`mediaType` is NOT stored** — it's derived from `encodingFormat` at render time (spec §4).
- **Tests:** identical bytes → identical hex + ni: on repeat runs and across paths (determinism); hex↔base64url round-trips; intrinsic facts for a sample image/video/pdf; missing-probe degrades without crashing.

### Phase 2 — schema.org frontmatter + stable-basename rule (the contract surface)
- Rewrite `templates/*.yml` to emit the spec §4 shape: `title`, `schema:sha256` (hex literal), `schema:contentUrl` (asset URL), `schema:image` (when present), `schema:encodingFormat`, `schema:contentSize`, `schema:width`/`height`, `schema:duration`, `schema:dateCreated`, `schema:uploadDate`, `memex:addedBy`; **drop** `layout`/`permalink`/`gallery`/`categories`. Permalink is derived (`/item/<hex>`), not stored.
- **Stable-basename rule:** define and freeze how a Record basename is derived (extends `slug.js`) so it is **stable across re-runs** (the wikilink resolution key). Specify the collision policy at generation time (path-qualifier friendly; no silent overwrite).
- **Tests:** frontmatter matches the contract for each media type; basename is deterministic across re-runs; basename collision within a directory is detected/handled per policy.

### Phase 3 — `manifest.json` + the tracked/untracked gesture
- Write `manifest.json` **inside** the processed directory: `{ originatedBy: <memex-id>, items: [ { path, hash (hex), ni, mimetype, byteSize, ... } ] }`.
- **Presence = tracked.** An unprocessed directory (no manifest) is invisible. Re-running `process` **updates** the manifest with new/changed files (incremental add).
- `<memex-id>` comes from local config (a machine identity; define where it lives — e.g. `memex.config.yml`).
- **Tests:** manifest written in-dir with correct shape + `originatedBy`; re-run adds a new file's entry without disturbing existing ones; a byte change produces a new hash entry (flagged for `verify`).

### Phase 4 — `process` command (dir → manifest + Records + baseline Collection)
- Orchestrate Phases 1–3 + generation: for each asset → a Record `.md` (frontmatter from Phase 2) in the 11ty source; one **baseline Collection `.md`** per directory whose body is `[[wikilinks]]` to each member Record.
- **One processed directory ↔ one Collection** (spec §6).
- **Tests:** end-to-end on a fixtures dir → N Records + 1 Collection + 1 manifest; Collection body links every Record by basename; idempotent re-run (no spurious rewrites when `overwrite` is false).

### Phase 5 — `update` command
- Scan the Library for `manifest.json`s **`originatedBy` others**; for each hash **not already tracked locally**, generate a **baseline Record + baseline Collection** (per new directory, preserving one-Collection-per-directory). Propagate `addedBy` onto each Item. Idempotent + diff-based (also catches peers' incremental adds).
- Keep it **simple** — no conflict resolution, no two-way anything (spec §7).
- **Tests:** a peer-originated manifest yields baseline Records for untracked hashes only; already-tracked hashes are skipped; a peer's incremental add is picked up on re-run; `addedBy` reflects the originating memex.

### Phase 6 — `verify` command (warn-only)
- Compare a processed directory's current state against its `manifest.json`: byte change (new hash for a known path), move/rename (path changed, hash same), deletion, stray/untracked files. **Warn only**, non-fatal.
- Structured output the 11ty `before` hook can surface (spec §6, job a).
- **Tests:** clean dir → no warnings; byte change / rename / deletion / stray each produce the expected warning; exit code stays success (warn-only).

### Phase 7 (parallel track) — 11ty scaffold + human-site wikilink rendering
- Minimal 11ty site consuming the generated `.md`; render `[[wikilinks]]` → `<a href="/item/<hash>">` for **human navigation** (separate from OP's #238 handler). A wikilink plugin or a small transform resolving basename → permalink.
- Wire `verify` into an 11ty `before` hook (surfaces jobs a + b warnings at build).
- **Tests / check:** site builds; a wikilink renders to the correct `/item/<hash>` anchor; unresolved wikilink surfaces a warning (mirrors the handler's `unresolvedLinks`).

## Cross-seam follow-on (NOT this wave)
- **Push to OP index** — a thin adapter feeding `(subjectUrl=/item/<hash>, rawMarkdown)` to OP; gated on #238. Add once the markdown handler lands.

## Definition of done
`memex process|update|verify` operate on a fixtures Library with full `node --test` coverage; `process` yields deterministic, contract-correct Records + Collection + in-dir manifest; `update` generates baseline records for peers' untracked assets; `verify` warns on drift; the human 11ty site builds and renders wikilinks. No dependency on a running OP. The generated `.md` set doubles as the fixture corpus for OP #238.

## Suggested ticket slicing
1. hashing + intrinsics (`hash.js`)
2. schema.org frontmatter + stable-basename rule
3. `manifest.json` + tracked/untracked
4. `process`
5. Collection-as-wikilinks generation *(can fold into 4)*
6. `update`
7. `verify`
8. 11ty scaffold + wikilink rendering + `verify` hook *(parallel)*
