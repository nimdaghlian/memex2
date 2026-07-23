# Memex 2.0 — Item indexing (decision record + plan)

> **Status: decisions locked, ready to plan implementation.** Authored 2026-07-23. Captures the settled model for writing an **Item** to OP. The **Record** indexing pass and **wikilink resolution** are deliberately out of scope here — they get their own docs. Companion to `2026-07-08-op-client-install.md`. Builds on the client design spec (`docs/specs/2026-07-07-memex2-client-design.md`), which this **amends** in one place (§ "Amendment").

## Scope

This covers exactly one thing: the CLI writing the intrinsic, content-derived facts about a file to its **Item hub** (`ni:///sha-256;…`). It is a distinct OP write pass from Record ingest. It does not touch Record identity, the Record→Item edge, or wikilinks.

## The model in one paragraph

An **Item** is the raw bytes, identified by `ni:///sha-256;<base64url>` (RFC 6920). The CLI writes a small set of **byte-deterministic facts** as `documentRecord` leaves directly on that `ni:` subject, sourced from the in-directory `manifest.json`. These facts are recomputable-identical on every Memex, so they are safe to attach to the shared hub. Everything that is *not* byte-deterministic (per-Memex or consistent-only-because-synced) stays on Records, not the hub.

## Amendment to the client design spec

The spec (§2–3) and the reference docs say the Item hub is **statement-free** (the statements-by principle). **We amend that:** the hub MAY carry statements, restricted to byte-deterministic intrinsics. Rationale: those facts are *provenance-free* — anyone recomputes them from the bytes and gets the same answer — so storing them on the hub creates no provenance ambiguity, which is the concern the statements-by principle exists to prevent. Curatorial claims (which *do* need provenance) remain outbound from Records.

## Decisions

**D1 — Invariant.** The Item hub carries **only byte-deterministic facts**. Anything consistency-by-sync or per-Memex lives on a Record.

**D2 — Fields on the hub.** Bare predicate → range → manifest source:

| Predicate | Range | Source (manifest) | Notes |
|---|---|---|---|
| `sha256` | literal | `hash` (hex) | The hash as a readable literal. |
| `encodingFormat` | literal | `mimetype` | MIME; `mediaType`/category is derived from this, never stored. |
| `contentSize` | number | `byteSize` | Byte length. |
| `width` | number | `width` | Images only; omitted if unread. |
| `height` | number | `height` | Images only; omitted if unread. |
| `duration` | literal | `duration` | A/V only; not probed in v1, reserved. |

**D3 — Subject + double-expression of the hash.** The subject is the `ni:` URI. The hash is expressed twice on purpose — the `ni:` URI (identity/subject, base64url digest) **and** the `sha256` hex literal (a `SELECT`-able value that needs no URI-parsing). Do not collapse them; this matches the original spec's intent.

**D4 — Explicitly NOT on the hub**, and why:

| Field | Why it's off the hub | Where it goes |
|---|---|---|
| `path` (asset library path) | Mutable (renames), one-to-many with a hash (dedup), consistent-only-by-sync | Record frontmatter |
| `uploadDate` | Consistent-only-by-sync, not byte-derived | Record frontmatter |
| `contentUrl` | Machine-local | Dropped; site derives a servable URL from `path` |
| `addedBy` / `originatedBy` | Per-Memex provenance | Record (or omitted) |
| `dateCreated` | Heuristic (filename/EXIF), non-deterministic | Record frontmatter, if used |

**D5 — Two-write model.** The OP layer sees two writes per asset: (1) **this** Item-hub write, and (2) the separate **Record ingest** (later doc). This pass is CLI-driven and sourced entirely from the manifest — it does **not** go through the markdown handler or `ingestBlobject`.

**D6 — Federation is fine.** Each Memex has its own Oxigraph and is single-writer, so identical `ni:` `documentRecord` across stores is not contention — it's independent copies. At federated read/merge time the identical triples dedupe trivially. Divergence can't happen for byte-deterministic fields (that's the whole point of D1).

## The write, concretely

For each entry in a directory's `manifest.json`:

```
recordDocumentRecord(
  item.ni,                                  // subject = the ni: hub
  { sha256: item.hash,
    encodingFormat: item.mimetype,
    contentSize: item.byteSize,
    width: item.width, height: item.height  // present only when probed
  },
  documentRecordSchema                       // the profile's declared predicates
)
```

Idempotent (delete-then-insert per predicate), single-valued (correct here — every hub fact is single-valued), deterministic across Memexes. Re-running `process` re-asserts identical triples.

## Profile requirements

- Declare each hub predicate in the profile's `documentRecord` schema as `{ predicate, namespace, range }`. OP resolves the IRI as `documentRecordNamespaces[namespace] + predicate` (or an explicit `iri`).
- The `schema` namespace covers `encodingFormat`, `contentSize`, `width`, `height`, `duration`.
- **Open vocab item (◆, OP #195):** `sha256` under the `schema` namespace resolves to `http://schema.org/sha256`, which schema.org does not define. It's a valid IRI (prefix-resolved) and works, but it's a fake property. Options: accept the prefix-resolved IRI for now, or declare an explicit `iri` on the entry (e.g. a `memex:`/`ni:` namespace). Track with OP #195; not a blocker.

## The one real gap: how to write leaves to a bare subject

Verified against `octothorpes@0.3.5`: `createClient` returns `{ indexSource, get, getfast, harmonize, sparql, api }` — it does **not** expose `recordDocumentRecord`. That method exists (on the internal indexer, `indexer.js`) and does exactly what we need (typed leaf triples on any subject, no `createPage`), but it isn't on the public surface. So writing intrinsics to a *bare* `ni:` subject (no Page-typing) needs one of:

1. **OP exposes the leaf write (recommended).** Surface `recordDocumentRecord`, or add a tiny `client.recordItem(ni, facts)` that calls it. Minimal, reuses the existing typed write + IRI resolution, keeps the logic in core. → a small new OP-core ask, additive.
2. **CLI writes via `client.sparql.insert` (no-OP-change fallback).** Works today (`sparql` is exposed), but the CLI would replicate the range→literal/IRI rule and namespace resolution (`resolveDocumentRecordIri` is not public), risking drift from core.
3. **Ingest the `ni:` as a blobject (rejected).** `indexSource`/`ingestBlobject` would `createPage(ni)`, typing the hub as an `octo:Page` and giving it title/description slots — collapsing the Item/Record type distinction. Avoid.

**Recommendation:** option 1 — the single Item-indexing dependency on OP core. Option 2 is the escape hatch if we want zero OP changes for the first pass.

## Read-side note (flag, not scope)

The read projection (`getBlobjectFromResponse`) is built around `Page` subjects. The federated Item view will need to read the hub's own `documentRecord` leaves off the bare `ni:` subject. Confirm that read path exists (or is a small addition) when we build the read layer — it's not part of this write, but it's the consumer of it.

## Dependencies / preflight

- `octothorpes@0.3.5` installed (done on the OP side).
- `ni:` as a subject/edge target — verified in OP #240 (C14 roundtrip).
- The manifest already carries every field D2 needs (Wave 1, shipped); `duration` is reserved (not probed in v1).
- **Blocking on OP:** the leaf-write surface (gap above) — resolve via option 1 or accept option 2.

## Out of scope (explicitly)

Record identity and URLs, Record ingest, the Record→Item edge (`octothorpes` subtype `Item`), wikilink resolution, deletion/reconcile. Those are the next docs.
