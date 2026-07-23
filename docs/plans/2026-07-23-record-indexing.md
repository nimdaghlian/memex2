# Memex 2.0 — Record indexing & wikilink handling (decision record)

> **Status: decisions locked.** Authored 2026-07-23. Companion to `2026-07-23-item-indexing.md`. Where it conflicts with the original client design spec (`docs/specs/2026-07-07-memex2-client-design.md` §5) or the OP-client-install plan (`2026-07-08-op-client-install.md`), **this supersedes** — notably: Records are indexed as **HTML**, not via the markdown handler.

## The pivot

md-only is retracted. The MVP has an **11ty site** built from the Record `.md` files, and **11ty is its own OP client** (its own `createClient`, sharing the one Oxigraph with the CLI — OP is multi-client by design). Records enter OP as **rendered HTML**, harvested by a **custom Memex harmonizer**. This drops the markdown handler (#238) and its wikilink resolution (#246) out of the Memex critical path.

## Division of labor

- **CLI** writes **Item hubs** (the `ni:` byte-intrinsics from the manifest — see the Item doc) and **generates the Record `.md` files**. Only the CLI has the manifest.
- **11ty** owns **Record indexing**: it mints Record URLs, resolves wikilinks, renders the octothorpe markup, and pushes each rendered page to OP via `indexSource(url, { content: html, harmonizer: 'memex-html' })`.

## Record identity & URLs

- **Basename = `slug(assetFilename)`** — the Record `.md` is named after the Item (asset) it describes, lowercased/dash-separated. (Already Wave 1 behavior.)
- **Flat namespace** — all Records land in one output directory. (Already Wave 1 behavior.)
- **Collisions → deterministic increment + flag.** Two distinct-content assets that slug identically get `name`, `name-2`, … The suffix is assigned by **stable order (sort colliders by hash)** so a name never wanders between runs when files are added/reordered; each collision is **warned** for a human to disambiguate at the source. (This replaces Wave 1's hash-suffix policy.)
- **`title` frontmatter = the name.** (Wave 1 currently stores the filename *with* extension; change to the name.)
- **Record URL = 11ty permalink derived from the slug** (e.g. `/items/{slug}/`). That URL string *is* the Record's OP `@id`.
- **Mutability accepted:** renaming an asset → new slug → new Record URL → the old Record subject is orphaned in the graph until a reconcile pass (OP #26); site-internal links stay correct because 11ty re-resolves on every build. Web-page semantics: the page moves, external refs break, the site self-heals.

## Frontmatter contract (revised)

Curator-facing `.md` frontmatter carries **only**:

```yaml
---
title: <name>                 # the asset's name (human-readable)
item: ni:///sha-256;<b64url>  # the durable Item anchor (hash); CLI-written
path: <library-relative path> # asset location (documentRecord fact)
uploadDate: <iso timestamp>   # documentRecord fact
tags: [ … ]
---
body + [[wikilinks]]
```

- **Bare keys**, no `schema:`/`memex:` prefixes (namespaces resolve from the profile).
- **Byte-intrinsics are NOT here** — `sha256`, `encodingFormat`, `contentSize`, `width`, `height` live on the `ni:` hub (Item doc), written by the CLI, never in the curator's file.

## Wikilink handling

- **Resolved at 11ty build.** 11ty holds the permalink map, so it's the resolver. Because the namespace is **flat**, resolution is a single `basename → permalink` lookup — no path-qualifier logic.
- `[[name]]` → `<a href="/items/{name}/">`. **One resolution serves both** the human site and the graph.
- **Unresolved** `[[x]]` → no anchor + a build warning (mirrors the wikilink-integrity job). Never stored in OP (matches OP #246/#243).
- OP harvests the rendered anchors as **plain link octothorpes** (Record→Record) via the custom harmonizer.

## The custom harmonizer & markup contract

A **Memex-defined HTML harmonizer** (declared in `profile.json`, authored against the OP #249 plain-`id`/`type` envelope) extracts, from each rendered Record page:

- `title` → canonical `title`
- tag markup → **term octothorpes**
- resolved wikilink anchors → **link octothorpes** (Record→Record)
- **Item-edge markup** → `{ type: 'Item', uri: <ni:> }` (the generated Record→Item edge; markup shape is ours to define since we own both the template and the harmonizer)
- *(optional)* `path` / `uploadDate` `<meta>` → `documentRecord` leaves on the Record, **only if** we want them queryable; MVP may leave them page-only.

The `@id` is the permalink (set by `indexSource(url, { content })`). The `profile.json` declares `relationshipSubtypes: [{ type: "Item", label: "…", path: "items" }]`.

## Tags are dual-use, not a conflict

The frontmatter `tags` key drives three consumers from one authoring act, and we keep all three:

- **Obsidian** — native tag pane / `tag:` search (the curator's editing surface).
- **Eleventy** — auto-creates a collection per tag; we render **tag-index pages** (`/tags/<slug>/`) with our own template. Presentation only.
- **OP** (Chunk 2) — the harmonizer emits each tag as a **term octothorpe** (Record→Term edge).

The payoff is the graph join OP alone can do: because tags become term edges and wikilinks become link edges, OP can **combine** them — "members of Collection X also tagged `winter`", "everything tagged `climate` that links here", "Collections whose members share a tag." Eleventy renders flat tag lists; OP reasons over tag + link + Collection-membership together. Same `tags`/`[[wikilinks]]` authoring feeds both; nothing is duplicated. (Earlier we considered suppressing Eleventy's tag collections with `eleventyExcludeFromCollections`; we instead embrace them — see the Chunk 1 plan Task 6b.)

## Implementation in two chunks

**Chunk 1 — the dry run (no OP).** CLI + 11ty produce everything *ready for OP* without any OP dependency: the `.md` Records (revised contract), the in-directory manifests, and the built 11ty site (permalinks from slugs, wikilinks resolved to anchors, the OP-ready markup rendered into the HTML). Nothing is sent to OP. This is the plan `2026-07-23-chunk1-dry-run.md`.

**Chunk 2 — OP integration.** Wire OP into the process: `profile.json`, the OP client module, the CLI's Item-hub write (Item doc), the custom Memex harmonizer, and 11ty-as-OP-client indexing. Depends on the Item-doc leaf-write surface, `sha256` namespace (#195 ◆), and — for clean renames — reconcile/stale-statement removal (#26 ◆). Its own plan, written after Chunk 1 lands.

The split is clean because Chunk 1 has **zero OP dependency** — it's pure file/site generation — while Chunk 2 is purely the OP wiring on top.
