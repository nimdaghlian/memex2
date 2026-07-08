# Memex 2.0 — Obsidian read plugin (preliminary spec)

> **Status: PRELIMINARY / DRAFT.** Authored 2026-07-08. A first sketch to capture the design, not a settled contract. Builds on [`2026-07-07-memex2-client-design.md`](2026-07-07-memex2-client-design.md) (the source of truth) and the md-only deployment direction. Expect open questions (§10) to move before this becomes a plan.

## 1. Purpose & scope

An Obsidian plugin that is a **read surface onto the local OP graph**: it runs queries against this Memex's Oxigraph and shows the results inside Obsidian — rendered inline, inserted into an open note, or materialized as new notes.

It is the **Obsidian-native sibling of the 11ty site**. Both consume OP reads; the site serves browsable HTML, the plugin serves the curator who lives in the vault. Its primary value is the **md-only deployment** (Obsidian + CLI + OP core + Oxigraph, no 11ty): without a site, the plugin is how a curator sees anything the graph derives — tag feeds, Collection membership, "N peers have this."

Think of it as **Dataview pointed at the OP graph** instead of Obsidian's own metadata: fenced query blocks, inline results, insert-at-cursor. That pattern is proven and curators already understand it.

## 2. Non-goals

- **Not an OP writer.** No graph-edge authoring, no OP-index push, no wikilink harvesting — those stay in the CLI / OP core (see §4). The plugin writes only *derived* or *curator* content.
- **Not a replacement for 11ty.** In the full build you run both; this doesn't remove the site.
- **Not mobile-first.** It targets desktop Obsidian (see §9).
- **Not the birthplace of query logic.** It's a thin client over a shared read layer (§4, §5).

## 3. Guardrails

Two guardrails keep the plugin from becoming a fork of logic that belongs elsewhere.

- **Write guardrail (inherited).** OP *writes* flow through the CLI / OP core; the plugin never authors graph statements. Anything it writes into the vault is ordinary `.md` — which the CLI later ingests, exactly as if the curator typed it. So the plugin is a fancier editor, never a second ingestion path.
- **Read guardrail (new).** The plugin does **not** reimplement OP queries. It calls the *same* read layer everything else uses, so the CLI, the plugin, and 11ty are three consumers of **one** query surface. Otherwise queries drift the way the main spec already worries wikilink resolution could.

## 4. Architecture

### Data source — how the plugin reads

Three candidates, in order of preference:

1. **Thin client over a CLI read command** *(recommended)* — shell out to `memex query … --json` and render the result. One source of read semantics, reused verbatim; desktop-only, which is acceptable. The plugin holds no query logic.
2. **Import OP core's read library** directly (Obsidian runs on Electron/Node on desktop). Tighter coupling, no subprocess, but pulls OP core into the plugin bundle.
3. **Hit Oxigraph's HTTP endpoint** from the plugin. Simplest transport, but the plugin would then own query construction — violating the read guardrail unless queries are named/served by OP core.

Recommendation: **(1)** for MVP. It keeps the plugin small and the read semantics single-sourced. Revisit (2) if subprocess latency hurts interactivity.

### Read modes — the design fork that matters

These sit on a spectrum of **currency**, and the plugin should keep them distinct rather than blur them:

| Mode | Persists? | Currency | Enters the OP graph? | Use |
|---|---|---|---|---|
| **Live query block** — a fenced ` ```op-query ` rendered dynamically each view | No (ephemeral) | Always current | No — Obsidian-only | Browsing a feed you just want to *look at* |
| **Insert-as-text** — command runs a query, writes markdown at the cursor | Yes | Snapshot (goes stale) | Yes — becomes curator content the CLI ingests | Pinning a result into a note |
| **Generate notes** — multi-doc materialization (one note per result, or a rollup) | Yes | Snapshot | Yes | Standing pages: a tag index, a Collection view |

MVP should ship the **live query block** (for browsing) plus one **explicit materialize action** (for durability). The staleness difference is the whole point — a live block is never wrong but never durable; a materialized result is durable but a snapshot until regenerated.

### Query surface

Start with **named, parameterized queries**, not raw SPARQL:

- `feed <term>` — Records tagged with a Term.
- `collection <slug>` — a Collection's current membership.
- `item <hash>` — one Item's local Record(s) + documentRecord.
- `peers <hash>` — coverage: which Memexes have curated this Item ("N peers have this").
- `backlinks <basename>` — reciprocal links (derived, not stored).

Raw SPARQL stays an escape hatch, not the primary interface. Named queries keep the read guardrail enforceable (they live in the shared read layer) and the UX legible.

### Rendering & link resolution

Results render as Obsidian-native markdown: lists or Dataview-style tables of Records as **`[[basename]]` wikilinks**, so navigation stays in the vault. This mirrors the deliberate two-surface split in the main spec — 11ty renders `[[…]]` → `/item/<hash>` anchors for the site; the plugin renders `[[basename]]` for in-vault navigation. Same Records, different link target per surface.

## 5. Currency, staleness & managed regions

- **Live blocks** re-query on view; nothing to stale.
- **Inserted / generated content** is a snapshot. To let a curator regenerate it without losing their own edits, materialized output is wrapped in a **managed region** delimited by Obsidian comments, e.g.:

  ```
  %% op:query feed:landscape %%
  - [[img-1758-122322]]
  - [[belmont-is-closed-011824]]
  %% /op:query %%
  ```

  Regeneration replaces only the content *between* the markers; everything outside is the curator's and is never touched. This is the same "don't clobber curator edits" discipline the CLI's Collection generation already needs.
- **Reindex cadence:** edits made in Obsidian reach the graph when the CLI next ingests them (manual `memex` cadence — the git-like tracked/manifest model). The plugin does not trigger ingestion (write guardrail).

## 6. Testability

Mirror the CLI's injectable design so the logic is testable outside Obsidian:

- **Pure modules** for query construction, result→markdown formatting, and managed-region splice/merge — unit-tested with plain fixtures.
- **A thin Obsidian-API adapter** (commands, editor insertion, code-block processor) kept as small as possible, since the Obsidian API resists unit testing.

## 7. Relationship to the CLI and 11ty

```
                 ┌─────────────────┐
   writes ─────▶ │  CLI / OP core  │ ─────▶ Oxigraph (the OP graph)
 (ingest only)   └─────────────────┘              │
                                          reads ───┼─────────────┐
                                                   ▼             ▼
                                          ┌───────────────┐  ┌──────────┐
                                          │ Obsidian plugin│  │  11ty    │
                                          │ (in-vault read)│  │ (site)   │
                                          └───────────────┘  └──────────┘
```

The plugin and 11ty are peers: both read the graph through the shared read layer, neither writes it. The plugin is what makes the read layer usable in the md-only deployment.

## 8. Dependencies & sequencing

Explicitly downstream. Do not start the plugin before its substrate exists:

1. **OP-index push** — the deferred CLI seam (needs OP core #238) so the graph is populated from `.md`.
2. **A shared read layer** — named queries in OP core plus a `memex query … --json` command that emits them. This is the plugin's data source and 11ty's too.
3. **The plugin** — a thin client over (2). Live blocks first, then the materialize action.

Built in this order, the plugin stays small and the read semantics stay single-sourced.

## 9. Open questions

- **Query interface:** named/parameterized queries vs a small DSL vs exposing raw SPARQL — and where the boundary sits.
- **Endpoint discovery:** how the plugin finds the CLI / OP endpoint (read `memex.config.yml`? a plugin setting? the `Library/.memex/<id>.json` profile?).
- **Desktop vs mobile:** subprocess-to-CLI is desktop-only; is a mobile story needed at all for a few-trusted-machines setup?
- **Live-block performance:** re-querying on every view — caching, debouncing, or a manual refresh affordance?
- **Managed-region format:** `%% op:query … %%` comments vs a dedicated block syntax; how to key a region to its query for regeneration.
- **Federation reads:** does `peers <hash>` / the on-trigger fan-out surface here too, or stay site-only in v1?
```
