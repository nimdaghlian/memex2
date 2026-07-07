# Memex 2.0 — OP Client Design Spec

> Authored 2026-07-07. This spec is the source of truth for building Memex 2.0. It was written *after* the OP ontology deep-dive captured in `docs/reference/` and **supersedes** any earlier Memex/`make-gals`/`op-memex-client` planning where they conflict.
>
> **Decision substrate (read these):**
> - `docs/reference/2026-07-06-jsonld-graph-model-and-terms.md` — blobject/MultiPass two-surface model, statements-by principle, RDF-star relationships, SKOS terms, documentRecord-as-content projection, the two-axis storage model, CDRs.
> - `docs/reference/2026-07-07-bridging-client-identity-notes.md` — identity/actor decision points (Q1–2 = OP data model, Q3–5 = client impl). Bridging is **out of scope** for Memex 2.0.
> - `docs/reference/2026-07-02-profile-vocabulary-decoupling.md` — client profile shape, three-layer vocab model, documentRecord + subtype declaration, the traversal rule.
>
> **Companion:** `docs/memex2-op-core-dependencies.md` — the OP-core work this client depends on, in priority order.

---

## 1. Purpose & scope

Memex 2.0 is a **local-first, SSG-integrated OP client** for cataloging content-addressed digital **Assets** in a **Library** that syncs (via Syncthing) across a small set of personally-trusted machines.

- Each machine runs its own **OP client + Oxigraph + 11ty site**, served locally at a custom URL.
- **Assets and their content-hash identity sync; Records do not.** Each machine authors its *own* Records about the shared Assets, and those Records are joined across machines by the Asset's content hash.
- **No ActivityPub / ATProto bridging.** (The bridging notes inform identity thinking but are not built here.)

**MVP is fully local.** Cross-machine federation (remote SPARQL queries) is **post-MVP** — see §8 and the dependency checklist.

### User flow

1. A Curator drops a directory of assets into the Library.
2. The Curator runs the CLI (`process`) on that directory. The CLI hashes each asset, writes a `manifest.json` *into* the directory, writes hash records to OP, and generates Record + Collection `.md` files into the 11ty source.
3. 11ty builds the `.md` files into a local site served at a custom URL.
4. The Curator edits the generated `.md` files in Obsidian (or any editor) to curate: add descriptions, tags (Terms), and `[[wikilink]]` backlinks that group content into Collections.
5. The site uses the OP API as a data source to render feeds of Collections and tagged content.
6. *(Post-MVP)* From an Asset page, the Curator can explicitly trigger a look-up for Records about that Asset on other Memexes in the network.

---

## 2. Entities & identity

| Entity | What it is | Identity | Syncs? |
|---|---|---|---|
| **Item** | The raw bytes of an asset. | Content hash → **`ni:///sha-256;<val>`** URI (RFC 6920). Machine-independent. **The federation join key.** | Identity syncs (via manifest) |
| **Record** | A markdown file → built HTML page describing one Item. The OP `Page`/blobject subject; carries the `documentRecord`. | Machine-local URL `/item/<hash>`. | No — local per Memex |
| **Collection** | A Record whose value is its in/out link set. One baseline Collection per processed directory. | Machine-local URL. | No — local per Memex |

**Key principles:**

- The **Item is a pure hub** (statements-by principle, ref §0/§2 of the graph-model doc): it asserts nothing itself; its "graph" is entirely **inbound** (`@reverse`), assembled by query from the Records that point at it.
- The **Record is the asserting document.** Every statement — curatorial and intrinsic — is *outbound from a Record*. Two Memexes making claims about the same Item = two Records, joined on the hash.
- **Item URI = `ni:///sha-256;<base64url-digest>`** (RFC 6920). The `/item/<hash>` **permalink uses hex** for readability; both derive from the same SHA-256 digest. The Item hub is a bare subject node; it carries no stored statements.

---

## 3. Graph shape

All statements are **outbound from a Record**. The Item hub stays statement-free.

```
# The one GENERATED structural edge — binds a machine-local Record to the shared hub:
<memexN/item/HEX>   octo:octothorpes   ni:///sha-256;VAL     (subtype: Item)

# Tag edges — from frontmatter `tags` and/or curator-added tags:
<memexN/item/HEX>   octo:octothorpes   <relay>/~/landscape   (tag / Bookmark mechanism → SKOS term)

# Plain OP links — authored as Obsidian [[wikilinks]] in the markdown body:
<memexN/item/HEX>   octo:octothorpes   <memexN/item/OTHER>   (plain link)
<memexN/collection/slug>  octo:octothorpes  <memexN/item/HEX> (plain link — Collection membership IS a link)

# Intrinsic + catalog facts → documentRecord LEAVES (never on the hub, never traversed):
<memexN/item/HEX>   schema:encodingFormat   "image/jpeg"
<memexN/item/HEX>   schema:contentSize      "482913"
... (see §4)
```

- The **`Item` edge is the only generated relationship** (from frontmatter/CLI, not curator-authored). Everything else the Curator authors is **one primitive: a plain OP link from an Obsidian `[[wikilink]]`.**
- **Collections have no membership subtype.** A Collection's value *is* its inbound/outbound links. "Membership" = "there is a link between the Collection and the Item/Record." Direction is free (Collection→Item or Item→Collection).
- **Backlink-ness is derived, never stored** (ref §2 of the graph-model doc). The Curator writes a plain link; reciprocity ("these two link each other") is computed at query time.
- **`documentRecord` is a leaf** (ref profile-vocab doc): stored as real triples, projected, but *never traversed* by the relationship engine.

### The federated Item view (post-MVP)

Visiting `/item/<hash>` renders **two graphs stitched at the hash**:
- **Local half** — this Memex's Record blobject(s): outbound `Item` edge, tags, links, and the `documentRecord`.
- **Federated half** *(on explicit trigger only)* — a MultiPass assembling every peer Record whose outbound `Item` edge targets the same `ni:` hub — the Item's inbound `@reverse` view, merged, with named-graph-per-peer provenance.

---

## 4. Vocabulary & documentRecord mapping

**Single shared vocabulary across all Memexes** (identical graph shape, content differs) — publishable as a spec. **Standards-based on schema.org**, with a thin `memex:` namespace for genuine gaps only.

### Field mapping (from current `make-gals` frontmatter → OP)

| Frontmatter | OP treatment | Predicate / mechanism | Range |
|---|---|---|---|
| `title` | Canonical OP field | `title` | literal |
| *(curator prose)* | Canonical OP field | `description` | literal |
| `tags[]` | **Relationship** (tag edges) | `octo:octothorpes` → `<relay>/~/<tag>` | node |
| *(the hash)* | **Relationship** (generated `Item` edge) + literal | `octo:octothorpes` → `ni:///sha-256;VAL` (subtype `Item`); plus `schema:sha256` hex literal | node + literal |
| `asset` | documentRecord leaf | `schema:contentUrl` | uri |
| `image` | documentRecord leaf — **picked up when present** | `schema:image` | uri |
| `categories` (image/video/audio/document) | **Not stored — derived** from mimetype at query/render time | *(derive from `schema:encodingFormat`)* | — |
| *(mimetype)* | documentRecord leaf — **literal** | `schema:encodingFormat` | literal |
| *(byte size)* | documentRecord leaf | `schema:contentSize` | literal |
| *(width/height)* | documentRecord leaf | `schema:width` / `schema:height` | literal |
| *(duration, a/v)* | documentRecord leaf | `schema:duration` | literal |
| `date` | documentRecord leaf | `schema:dateCreated` | literal |
| `dateadded` | documentRecord leaf | `schema:uploadDate` | literal |
| *(origin Memex)* | documentRecord leaf — **provenance** | `memex:addedBy` | literal/uri |
| `layout`, `permalink`, `gallery` | **Dropped from OP** (11ty rendering / replaced by hash-permalink + Collection links) | — | — |

**Notes:**
- **`memex:` is only `addedBy`** — everything else is schema.org. **`mediaType` is not stored; it is derived** from `schema:encodingFormat` (the MIME prefix: `image/*` → image, etc.). schema.org has no clean *literal* category property, and the category is a pure function of the MIME type, so materializing it separately would only risk drift. Category queries use a MIME-prefix filter (`STRSTARTS(?fmt, "video/")`); materialize a `memex:mediaType` literal later only if a feed query is meaningfully simpler with a stored category. (The schema.org *node* routes — `rdf:type schema:VideoObject` or `schema:additionalType` — were rejected because they want to type the media *thing*, which is our statement-free Item hub; typing the Record instead is semantically loose.)
- Every `documentRecord` key must be **declared in the client profile** with namespace + range (the admission allowlist + typing contract; undeclared predicates a harmonizer emits are dropped — ref profile-vocab doc).
- **Intrinsic facts are computed by the CLI at hash time** (single pass over bytes; deterministic; identical on every Memex) and written into frontmatter.
- **The hash is expressed twice, deliberately — same digest, two roles. Do NOT "optimize away" the literal.** (a) As the **Item edge target** `ni:///sha-256;<base64url>` — an *identity URI* (a node), the subject/object of edges and the federation join key. (b) As a **`schema:sha256` hex literal** on the Record — an *asserted, display/sort/query-facing value* you can `SELECT` without URI-parsing (and it matches the hex `/item/<hex>` permalink). The `ni:` URI carries algorithm identity + a dereference convention (`.well-known/ni/`); the hex literal is the readable value. The literal is asserted *by the Record* about the item it describes (like `encodingFormat`), never stored on the hub — so it is not a statements-by violation. Dropping the literal would force every consumer to base64url-decode the URI.

---

## 5. Markdown handler & wikilink resolution

**New OP core feature** (see dependency checklist): a **core Markdown handler** that parses `.md` directly.

- **Parses** frontmatter (YAML → canonical fields + declared documentRecord leaves) and **body `[[wikilinks]]` → plain OP links**, from raw markdown. OP no longer depends on the 11ty build for link harvesting. (11ty still renders wikilinks → anchors for the *human-facing* site — a separate concern.)
- **Input contract:** the client feeds `(subjectUrl = /item/<hash>, rawMarkdown)`; the handler stamps edges under the public Record URL.

### Resolution — Obsidian's model, reimplemented (we do NOT read Obsidian's cache)

Obsidian's link graph lives in an internal IndexedDB/LevelDB store (undocumented, non-portable, only reachable from inside a running plugin). We **reimplement its semantics** over the raw `.md` set instead — tool-agnostic, deterministic, portable:

- **Resolve by basename**, against a **whole-instance index, deferred**: index all Records first (building `basename → hash → URL`), *then* resolve links. This handles mutual links (`A ↔ B`) that file-order resolution cannot.
- **Maintain a `resolvedLinks` / `unresolvedLinks` split.** An unresolved `[[…]]` (target not catalogued) is **recorded as pending, not dropped or fatal** — fits OP's tolerance for links to not-yet-indexed URLs.
- **Collisions → path-qualifier disambiguation** (Obsidian's own rule): basename first; if ambiguous, honor/require a path segment (`[[subfolder/name]]`); nearest-in-folder heuristic otherwise. We do **not** invent hash-suffix collision handling — matching the tool keeps the Curator's mental model identical in-editor and on-site.
- **The hash-in-frontmatter is the durable anchor.** A Curator rename changes a basename but not the frontmatter hash, so renames surface **loudly as `unresolvedLinks`** — never silent graph corruption.

Resolution map: `basename → hash → URL`. Requires the CLI to emit a **stable basename** per Record (today `make-gals` slugs the filename; that slug becomes the resolution key and must stay stable across re-runs).

---

## 6. Asset Library, manifest & processing model

### Two file layers

- **Asset layer (synced across Memexes):** asset files + a **`manifest.json`** living *inside each processed directory*, so it travels with the assets on sync.
  - `manifest.json` = `{ originatedBy: <memex-id>, items: [ { path, hash, mimetype, size, ... } ] }` — the machine-readable `path → hash` ledger + intrinsic facts.
- **Record/Collection layer (local, per Memex):** the `.md` files in the 11ty source.

### Processing = the tracked/untracked boundary (git-like)

- A directory is **invisible to the system until processed.** No `manifest.json` = untracked scratch space; the Curator freely renames/edits/culls until satisfied.
- **Processing** (running the CLI) writes `manifest.json` into the directory — marking it *tracked* — and generates the OP records + `.md` files.
- **One processed directory ↔ one Collection.** `manifest.json` is the machine view (`path→hash`, synced, integrity); the Collection `.md` is the curatorial view (`[[links]]`, local, editable) of the *same* membership set.
- **Incremental adds** just update `manifest.json` with the new files/hashes (re-run `process`).

### Two integrity jobs (warn-only in v1)

- **(a) Asset integrity** — assets vs `manifest.json`: detect byte changes (new hash for a known path), moves/renames (path changed, hash same), deletions, and stray/tampered files. Home: **CLI `verify`**, **triggerable from an 11ty `before` hook** as a convenience. Guards against a Curator disturbing a synced asset directory.
- **(b) Wikilink integrity** — the **`unresolvedLinks` report** (§5) surfaced in the 11ty build. A rename or bad link shows up here.

**Auto-rewrite-on-rename** (Obsidian's full behavior — programmatically rewriting `[[old]]` → `[[new]]`) is **deferred to v2**; it's stateful and edits curator files. v1 warns only; the hash anchor guarantees no silent corruption.

---

## 7. CLI surface

The CLI (greenfield; may reuse `make-gals` logic) lives in this repo alongside the SSG/client; can be split into a standalone package later.

- **`process <dir>`** — hash the directory's assets → write `manifest.json` (`originatedBy: me`, with intrinsic facts) → write hash records to OP → generate local **Records + a baseline Collection**.
- **`update`** — scan the Library for `manifest.json`s `originatedBy` **others** → for each hash **not already tracked** in the local store, generate a **baseline Record + baseline Collection** (per new directory, preserving "one Collection per directory"). Idempotent & diff-based, so it also picks up incremental adds by peers. Propagates `addedBy` onto each Item.
- **`verify`** — asset-integrity check (job a); warn-only.

**Three provenance notions — keep distinct:**
- **`addedBy`** — which Memex first introduced the Asset. Baseline, factual, identical on every Memex (from the manifest).
- **coverage / "described by"** — which Memexes have said something *meaningful* (§8). Curatorial.
- **statement provenance** — which Memex asserted a given edge; attached at federated-query time via named graphs.

`update` is intentionally simple — no conflict resolution, no two-way anything, just "generate baseline records for untracked assets others added."

---

## 8. Federation (POST-MVP — build local-first, this comes last)

**Hard requirement: local-first, remote-on-trigger.** The default read path for `/item/<hash>` and all feeds queries **only this Memex's own Oxigraph** — no registry read, no fan-out, no network, works fully offline. Remote is a **distinct, explicit action** and the *only* thing that touches peers. Two code paths (`local`, `federated`); nothing auto-promotes local to federated.

- **Discovery = the Library.** Each Memex writes its **own** profile file `Library/.memex/<memex-id>.json` = `{ id, name, oxigraphEndpoint }`. The **union** of these files is the peer registry — each Memex writes only its own, reads all; conflict-free under Syncthing. This is **network config, not graph-modeled identity** (trust is face-to-face; bridging/DID identity is out of scope).
- **Coverage index** `Library/.memex/<memex-id>.coverage.json` (synced): **curated-only** — the hashes for which this Memex has a statement *beyond the `process`/`update` baseline* (a description, added tag, backlink, curated Collection membership). Because `update` gives every Memex baseline Records for every Asset, "all hashes I have Records for" would be noise — so coverage is filtered to genuinely-curated Items from v1. The baseline is well-defined (the fields `process`/`update` emit), so the diff is tractable.
- **The affordance is cheap and offline.** Synced coverage lets a Memex show "**N peers have notes on this Item**" with zero network I/O. The Curator clicks that to invoke the fan-out.
- **On trigger:** **app-level parallel** SPARQL queries to **only the advertising peers** (from coverage) → merge with **named-graph-per-peer provenance** → **partial-on-offline** (skip unreachable, note it). *Not* SPARQL `SERVICE` (Oxigraph support unverified; app-level degrades gracefully). Generalizes to Term/Collection feeds ("everything tagged `climate` across Memexes").

**This is the lowest-priority workstream. MVP ships without any remote connection.** The peer-profile and coverage *files* are cheap to write earlier; the *querying* is deferred and dead-last.

---

## 9. Non-goals / deferred

- ActivityPub / ATProto bridging (identity notes inform, but nothing is built).
- Two-way sync / write-back / CDR editing (the graph-model doc's hard mode).
- Auto-rewrite-on-rename (v2).
- SPARQL `SERVICE`-based federation (app-level fan-out instead; `SERVICE` only if verified later).
- Conflict resolution in `update`.

---

## 10. Open items to settle during implementation

- Exact `ni:` encoding for the hub `val` (base64url per RFC 6920) vs the hex permalink, and the canonical conversion helper.
- The `manifest.json` schema (fields beyond `path`/`hash`/`originatedBy`; which intrinsic facts live there vs recomputed).
- The stable-basename rule for the CLI (slug determinism across re-runs; collision policy at generation time).
- 11ty wikilink rendering for the human site (plugin vs custom transform) — separate from OP's handler, but needs to resolve `[[…]]` → `/item/<hash>` for navigation.
- Coverage baseline-diff implementation (how "beyond baseline" is computed cheaply).
- Client profile file layout (`profile.public.json`) and how it declares the vocabulary (documentRecord fields + ranges) and the `Item` subtype path.
