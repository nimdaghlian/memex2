# Memex 2.0 — the `memex query` read layer (preliminary spec)

> **Status: PRELIMINARY / DRAFT.** Authored 2026-07-08. Deliberately conservative — a small, shared read surface, not a query platform. Builds on [`2026-07-07-memex2-client-design.md`](2026-07-07-memex2-client-design.md) and feeds [`2026-07-08-obsidian-read-plugin-design.md`](2026-07-08-obsidian-read-plugin-design.md). OP core does the graph work; this spec is only the thin Memex-specific layer over it.

## 1. Purpose & scope

A small set of **named, parameterized queries** over the local OP graph, exposed as `memex query …` subcommands that emit JSON. It's the **shared read substrate** for three consumers: the CLI's own read commands (the md-only deployment), 11ty's feeds, and (later) the Obsidian plugin. One query surface, three consumers.

Scope is intentionally narrow: **define the queries and the CLI surface, nothing more.** If a query needs graph intelligence Memex doesn't already have, that intelligence goes into OP core — not here.

## 2. Division of labor

The point of this layer is to stay thin. Draw the line clearly:

| OP core (the nuts and bolts) | Memex (this layer) |
|---|---|
| SPARQL execution / programmatic read API | The named query *definitions* (which read call, which params) |
| Blobject shape, MultiPass, documentRecord projection | Parameter validation |
| Graph traversal, derived reciprocity, term resolution | The stable JSON output projection |
| Federation fan-out (post-MVP) | The `memex query` CLI surface |

Memex **composes** OP core's read API; it never reimplements traversal or SPARQL execution. If you find yourself writing graph logic here, it belongs upstream.

## 3. Guardrails

- **Read-only.** No writes, no side effects on the graph.
- **Local-only in v1.** Reads hit only this Memex's Oxigraph — no registry read, no fan-out, works offline (main spec §8). Federation is deferred (§10).
- **Lean on OP core.** Prefer OP's programmatic read API over the HTTP `/get/` pipeline (known latency overhead, main spec §2 note).
- **One catalog.** The named queries live in a single module consumed by the CLI, 11ty, and the plugin — so read semantics never fork across surfaces (the read guardrail from the plugin spec).

## 4. v1 query catalog

Only what the near-term consumers actually need. Three queries:

- **`item <hash>`** — one Item's local Record(s): the outbound `Item` edge, tags, links, and the `documentRecord`. The item view.
- **`feed <term>`** — Records tagged with a Term (`octo:octothorpes` → `<relay>/~/<term>`).
- **`collection <slug>`** — a Collection's current membership (the links to/from the Collection Record).

That's the set that unblocks 11ty feeds and md-only reading. Everything else is deferred (§10).

## 5. Command surface & output contract

A single `query` namespace, kept separate from the write commands (`process`/`tag`/`update`/`verify`) so the read surface is obvious:

```sh
memex query item <hash>
memex query feed <term>
memex query collection <slug>
```

- **Human-readable output by default** (a list, consistent with the other commands); **`--json` for the machine contract** that 11ty and the plugin consume.
- **`--out`/`--config`** as elsewhere, to locate the graph/config.

**JSON envelope** (stable, conservative — a thin projection, not the full blobject):

```json
{
  "query": "feed",
  "params": { "term": "landscape" },
  "results": [
    { "hash": "<hex>", "ni": "ni:///sha-256;<b64url>", "basename": "img-1758-122322",
      "url": "/item/<hex>", "title": "IMG_1758_122322.jpeg", "tags": ["landscape"] }
  ]
}
```

The projection carries just enough to render a feed list and to resolve links on any surface (`basename` for in-vault `[[…]]`, `url` for the site). The **full blobject stays behind `item`** — feeds don't need it, and keeping the feed projection thin makes it cheap and stable.

## 6. Currency

Results reflect the graph **as of the last ingest** — the manual `memex` cadence, not live. A feed is only as current as the last time the CLI pushed `.md` to the index. This is consistent with the tracked/manifest model and needs no watcher.

## 7. Testability

- **The query catalog is pure**: given an OP-core read client, each named query returns a projection. Test it against a stubbed read client, or a small seeded local Oxigraph fixture — no network.
- **The CLI surface stays thin** (arg parsing → catalog call → format), mirroring the rest of the CLI.

## 8. Dependencies & sequencing

1. **OP-index push** (the deferred CLI seam, OP core #238) — there's nothing to query until the graph is populated from `.md`.
2. **[verify] OP core programmatic read API reachable from the client** — confirm the client can call OP's read path directly (main spec §2 / deps #5).
3. **This layer** — the three named queries + `memex query`. Ship JSON first (it's the contract); the human format is a convenience.
4. **Consumers** — 11ty feeds and the Obsidian plugin, built on top, later.

## 9. Explicitly deferred (kept out on purpose)

- **Raw SPARQL passthrough** — an escape hatch, not v1. Named queries only, so the catalog stays the single source of read semantics.
- **`backlinks`** — waits on derived-reciprocity (OP core #6).
- **`peers <hash>` / coverage** — the "N peers have this" affordance; waits on the coverage index, and reads only synced files even then (still no network).
- **Federation / remote reads** — post-MVP, dead last (main spec §8).
- **Pagination, caching, a query DSL** — not until a real feed is large enough to need them. A simple `--limit` is the most I'd add early, and only if asked.

## 10. Open questions

- **Output projection:** is the thin row (§5) enough for every feed 11ty wants, or will some need more fields? Resist widening it until a consumer proves the need.
- **Command shape:** `memex query feed <term>` vs top-level `memex feed <term>`. The namespaced form keeps reads visibly separate; aliases can come later.
- **Endpoint discovery:** how the CLI locates the OP read API / Oxigraph (config field vs profile file).
- **Transport to OP core:** programmatic import vs a local HTTP call — gated on the deps #2 verify.
- **`--limit` now or later:** include a basic cap from the start, or wait until a feed is big enough to hurt?
```
