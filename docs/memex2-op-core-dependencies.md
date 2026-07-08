# Memex 2.0 — OP Core Dependency Checklist

> The OP-core (and OP-client-config) work Memex 2.0 depends on, **in priority order**. Companion to `docs/specs/2026-07-07-memex2-client-design.md`. Use this to sequence work in the `octothorp.es` repo against the Memex build.
>
> Legend: **[core]** = new/changed work in `packages/core` (octothorp.es). **[profile]** = Memex client-profile configuration, *not* a core change. **[verify]** = a capability to confirm on the deployed stack before relying on it.

## MVP-blocking (do first)

1. **[core] `documentRecord` projection** — route declared non-canonical predicates into a `documentRecord` sub-object in `getBlobjectFromResponse`; drop undeclared ones. *Not built yet* (confirmed in the profile-vocab doc). This is the seam all Memex intrinsic/catalog facts flow through. **Hard blocker.** → **octothorp.es #237**; plan: `octothorp.es/docs/plans/point7/2026-07-07-documentrecord-projection.md`.

2. **[core] Markdown handler** — a `handlers/markdown/handler.js` alongside the HTML handler that parses YAML frontmatter + body `[[wikilinks]]`. Includes the **deferred, whole-instance, basename-keyed resolution pass** with a `resolvedLinks`/`unresolvedLinks` split and path-qualifier collision handling (spec §5). Input contract: `(subjectUrl, rawMarkdown)`. **Hard blocker** for the curate-in-Obsidian workflow. → **octothorp.es #238**; plan: `octothorp.es/docs/plans/point7/2026-07-07-markdown-handler-wikilinks.md`.

3. **[profile] Client Profile Rev 1** — a single committed `profile.json` holding the Memex vocabulary declaration: every `documentRecord` predicate with namespace + range (schema.org + the thin `memex:` gaps), plus the declared `Item` relationship subtype and its first-class path. `.env` = secrets only; **no public/full split** — the profile carries no secrets by construction, and external-account credentials are resolved from `.env` by `provider` at point-of-use. Loader = read + validate + serve (`getProfile()`). Drives admission + typing. (Ref octothorp.es #215/#216/#217, profile-vocab doc.)

4. **[profile] `Item` relationship subtype declaration** — declared on the **Memex client profile**, *not* core. `resolveSubtype` already passes unknown subtypes through into the `octothorpes` array; declaration only promotes it to a first-class path (`/get/item/...`). No core change required — a profile-config task.

5. **[verify] `ni:` URI as subject / edge target** — confirm Oxigraph and the OP read/write path handle `ni:///sha-256;<val>` URIs cleanly as a relationship object and as a queryable node (it's just an IRI, so this should be free, but confirm no scheme assumptions in `queryBuilders`/normalization).

## Strongly wanted (shortly after MVP)

6. **[core] Derive-backlinks-not-store** — reciprocity computed at query time; stop storing the `backlink` switch (graph-model doc §2). Memex leans on plain links + derived reciprocity for the curator-link/Collection model. Can ship before RDF-star.

7. **[core] RDF-star relationship storage** — move typed relationships off blank nodes to `<< s p o >>` (graph-model doc §3). Gives edge metadata a home and edges identity. Resolve the doc's 3 open items first (scope, assertion semantics, **[verify] Oxigraph SPARQL-star support**). Not strictly MVP-blocking, but the correct substrate for relationship metadata and labels.

8. **[core] SKOS term labeling (additive, now)** — `octo:Term rdfs:subClassOf skos:Concept` + `skos:prefLabel` on term creation (graph-model doc §4). Cheap, additive, benefits Memex tag feeds. The federation-era hub/ConceptScheme parts are **not** needed (Memexes share one vocabulary; no cross-relay term translation).

## Post-MVP (federation — DEAD LAST, not in MVP)

9. **[core] Federation query layer** — app-level parallel fan-out to peer Oxigraph endpoints + merge with named-graph-per-peer provenance + partial-on-offline (spec §8). Keep in mind while building the query layer, but **build local-first; this is the lowest priority.** Actually connecting to remote SPARQL DBs is **not part of the MVP.**
   - **[verify]** Oxigraph SPARQL `SERVICE` / federated-query support — gates whether `SERVICE` is ever an option; app-level fan-out is the default regardless.
   - **[verify]** Oxigraph named-graph / quad-store mode — for per-peer provenance and the MultiPass-as-named-graph shape (graph-model doc §5).

10. **[core] MultiPass-as-named-graph** — the merged federated Item view as a named graph whose name is "Memex-X's answer" (graph-model doc §5). Downstream of #9; gated on blobject node-correctness.

## Standards / vocabulary (parallel, low-risk)

11. **[profile] schema.org + `memex:` vocabulary mapping** — the field→predicate table in spec §4, declared in the profile. No core change; just the declaration. Publishable as the Memex vocabulary spec later.

---

### Rough sequencing

```
MVP:        #1 → #2 → #3 → #4 → #5   (+ #11 alongside #3)
Post-MVP:   #6 → #8 → #7
Last:       #9 → #10
```

The single biggest core blocker is **#1 (documentRecord projection)**; the single biggest net-new core feature is **#2 (Markdown handler + resolution)**. Everything federation-related (#9/#10) is explicitly deferred and must not gate the local MVP.
