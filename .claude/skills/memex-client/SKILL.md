---
name: memex-client
description: Build and work on Memex 2.0 — a local-first, SSG-integrated OP (Octothorpes Protocol) client for cataloging content-addressed digital assets in a Syncthing-shared Library. Triggers include "work on Memex", "Memex 2.0", the CLI (process/update/verify), the Item/Record/Collection model, the asset manifest, wikilink harmonizing, or federating Records across Memexes. This is a CONSUMER of OP, not OP-core development.
---

# Memex 2.0 — OP Client

Memex 2.0 is a **local-first OP client** that catalogs content-addressed digital **Assets** in a **Library** synced (via Syncthing) across a few personally-trusted machines. Each machine runs its own OP client + Oxigraph + 11ty site. Assets and their content-hash identity sync; **Records are local** and joined across machines by content hash. **No ActivityPub/ATProto bridging.**

## Read first

- **`docs/specs/2026-07-07-memex2-client-design.md`** — the design source of truth. Read it fully before any build work.
- **`docs/memex2-op-core-dependencies.md`** — what OP-core work must land (in `octothorp.es`) to unblock the build, in priority order.
- **`docs/reference/`** — the OP ontology decisions this is built on (graph model, profile/vocab, identity notes). Consult when a modeling question arises; **today's spec decisions override these where they conflict.**

## The model in one screen

- **Item** = raw bytes. Identity = **`ni:///sha-256;<val>`** (RFC 6920), machine-independent, the federation join key. A **pure hub**: it asserts nothing; its graph is entirely inbound (`@reverse`), assembled by query.
- **Record** = a `.md` file → built HTML page at machine-local `/item/<hash>`. The OP `Page`/blobject subject and `documentRecord` carrier. **The asserting document** — every statement is outbound from a Record.
- **Collection** = a Record whose value is its in/out link set. One baseline Collection per processed directory.
- **Statements-by principle:** never store statements *about* the hub on the hub. Curatorial + intrinsic facts attach per-Record.
- **One curator primitive:** an Obsidian `[[wikilink]]` in the body → a plain OP link. The only *generated* relationship is the `Item` edge (`Record → ni:hash`, subtype `Item`).
- **documentRecord** = leaf triples (schema.org vocab + thin `memex:`), stored + projected, never traversed. Declared in the client profile with namespace + range.

## Build orientation

- **CLI:** `process <dir>` (hash → `manifest.json` in-dir → OP records + Records/Collection `.md`), `update` (generate baseline Records for assets others added), `verify` (asset-integrity, warn-only). May reuse `make-gals` logic (`~/dev/make-gals`), greenfielded here.
- **Manifest = tracked/untracked boundary:** a directory is invisible until processed; `manifest.json` lives *inside* the processed dir and syncs with it.
- **Wikilink resolution:** reimplement Obsidian's model (basename keys, deferred whole-instance resolution, `resolvedLinks`/`unresolvedLinks`, path-qualifier collisions) in the **OP core Markdown handler** — do NOT read Obsidian's private cache. The hash-in-frontmatter is the durable anchor; renames surface as unresolved links (warn-only v1).
- **Federation is POST-MVP and dead-last.** Build local-first: default reads hit only local Oxigraph. Remote is an explicit trigger. Peer discovery = per-Memex profile files in the Library; a synced curated-only coverage index powers a cheap offline "N peers have this" affordance.

## OP concepts you consume (not develop)

- **Blobject** — the canonical JSON shape for an indexed page (a Record). Outbound statements only.
- **MultiPass** — a query result = a graph slice (many blobjects). The federated Item view is a MultiPass merged on the hash.
- **Handler / harmonizer** — converts a source format → blobject. Memex needs the **new core Markdown handler** (frontmatter + wikilinks). For handler/harmonizer specifics, the `octothorpes` skill's `handlers.md` / `harmonizers.md` in the `octothorp.es` repo are the reference.
- **SPARQL read** — feeds (Collections, tagged content) query the local Oxigraph. Prefer OP's programmatic read API over the HTTP `/get/` pipeline (which has known latency overhead).

## Guardrails

- This client **consumes** OP; put business logic in OP core (`@octothorpes/core` in `octothorp.es`), not in client duplication. Core changes needed are enumerated in the dependency checklist — coordinate them in the `octothorp.es` repo.
- Keep the vocabulary **standards-based (schema.org)**; `memex:` only for genuine gaps (`addedBy`). `mediaType` is **derived** from `schema:encodingFormat`, not stored. The hash is expressed twice on purpose — `ni:` URI (identity/edge target) + `schema:sha256` literal (display/query); don't collapse them.
- Secrets in `.env` only; everything else (identity, vocabulary declaration, indexing config) in a committed `profile.public.json`.
- Bridging (AP/ATProto) is out of scope.
