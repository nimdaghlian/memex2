# Memex 2.0 × Octothorpes — Markdown pipeline demo

Drives the OP-core Markdown pipeline that shipped in epic **#240** and was
reworked for declared-URI wikilink resolution in **#246**, end to end against a
local relay: a small `.md` vault → per-handler resolution → ingest → typed
read-back over HTTP.

This is a **read-only demo of OP core** — it imports `octothorpes` straight from
an OP checkout and writes to the local store under identities declared in the
vault's own frontmatter (`ni:///sha-256;memexdemo…`, clearly namespaced) so it
is fully re-runnable and self-cleaning. It changes nothing in the OP repo.

## What you're seeing (the pipeline)

```
.md file (frontmatter declares its OWN `uri`)
  └─ buildTargetMap (ONE pass over the vault, run once by the caller)
        name -> declared uri; slash-qualified path tails too, so a basename
        collision can be disambiguated; a colliding bare key -> AMBIGUOUS
  └─ harmonizeSource (markdown handler, { uriField:'uri', wikilinkTargets })
        frontmatter -> canonical fields + documentRecord passthrough
        the handler sets @id from the declared `uri` (no caller stamp)
        frontmatter tags -> hashtag thorpes (octo:Term)
        body [[wikilinks]] resolved AGAINST DECLARED URIs, inside the handler:
          match      -> { type:'link', uri } edge directly on octothorpes
          no match   -> no edge, a { target, reason:'no-match' } warning
          ambiguous  -> no edge, a { target, reason:'ambiguous' } warning
        raw extraction detail (heading/alias) stays on blob.wikilinks
  └─ indexer.ingestBlobject  (schema from the live /profile.json)
        Page + Link/Item relationships + TYPED documentRecord leaves
  └─ /get HTTP read-back  → documentRecord comes back typed
```

**Anchoring changed in #246.** Identity used to be minted from the file path
by the caller (`resolveWikilinks`/`applyResolution`, a whole-instance pass
after harmonization). Now each document *declares* its own URI in
frontmatter, the handler sets `@id` from it directly, and wikilink resolution
happens per-document, inside the handler, against a `name -> declared uri`
lookup the caller builds once (`buildTargetMap`). There is no more
path-to-URL minting and no separate resolve/apply pass.

## Prerequisites

- **OP dev server (the relay)** at `http://localhost:5173` on branch
  **`240-sprint`** (or `development` after merge). Start it in the OP
  checkout: `npm run dev`.
- **Oxigraph (SPARQL)** at `http://0.0.0.0:7878`.
- OP checkout at `/Users/nim/dev/octothorp.es` (override with `OP_REPO=/path`).
  The runner loads `octothorpes` core from `$OP_REPO/packages/core/index.js`,
  `buildTargetMap`/`AMBIGUOUS` from
  `$OP_REPO/packages/core/handlers/markdown/handler.js` (a subpath import —
  not re-exported from the core barrel), and reads SPARQL credentials from
  `$OP_REPO/.env` at runtime — **no secret is copied into this repo**.
- Node ≥ 18. No `npm install` needed in memex2: core's transitive deps resolve
  from the OP workspace's `node_modules`.

Sanity check the services:

```
curl -s http://localhost:5173/profile.json | head -c 80
curl -s 'http://0.0.0.0:7878/query?query=ASK%7B%3Fs%20%3Fp%20%3Fo%7D' -H 'Accept: application/json'
# → {"head":{},"boolean":true}
```

## The vault (`demo/vault/`)

6 Memex-shaped Records. Each declares its **own identity** in frontmatter
(`uri: ni:///sha-256;memexdemo…`); the **vault-relative path** is only the
collision key used to disambiguate wikilink targets, never the identity.

| file | role |
|------|------|
| `notes/Redwoods.md`        | the star: full documentRecord, an Item hub edge, and every wikilink variant |
| `notes/Ferns.md`           | mutual partner — links back to Redwoods |
| `notes/Canopy.md`          | has an `## Overview` heading (alias+heading link target) |
| `field/Sequoia.md`         | basename collision — NOT the qualified target |
| `archive/Sequoia.md`       | basename collision — IS the target of `[[archive/Sequoia]]` |
| `collections/FieldGuide.md`| plain wikilinks to three notes |

`Redwoods.md` exercises, in one file:

- **Declared identity**: `uri: ni:///sha-256;memexdemoRedwoods…` — becomes `@id`,
  excluded from documentRecord.
- **Declared documentRecord** frontmatter: `encodingFormat`, `contentUrl`,
  `contentSize`, `dateCreated`, `sha256`, `addedBy`.
- **Undeclared** frontmatter `layout` / `permalink` (must be dropped at ingest).
- **`tags`** (`memexdemo-trees`, `memexdemo-conifers`) — lifted to hashtags.
- **Wikilinks**: mutual `[[Ferns]]`; alias+heading `[[Canopy#Overview|the canopy overview]]`;
  unresolved `[[Wildfire]]` (no Wildfire doc exists — stays a warning, never an
  edge); collision-qualifier `[[archive/Sequoia]]`; a `[[Ghost]]` inside a
  fenced code block that must be ignored.

## Run it

```
node demo/run-demo.js          # cleanup → harmonize/resolve → ingest → read-back
node demo/run-demo.js --clean  # remove all demo triples and exit
```

The runner cleans up first, so it is safe to run repeatedly.

## Step-by-step (real observed output, trimmed)

Ingest logs two noisy lines you can ignore: `create page` and
`# <uri> <tag>` (an OP-core `console.log` in the hashtag path).

### [1] Profile-driven schema

The documentRecord schema is pulled from the **live** relay, not hardcoded:

```
[1] profile.json documentRecord predicates: encodingFormat(literal),
    contentUrl(uri), contentSize(number), dateCreated(timestamp),
    sha256(literal), addedBy(literal)
```

*What you're seeing:* ingest behavior is driven by `profile.json`'s
`vocabulary.documentRecord`. Change the profile, change what persists.

### [3] Harmonize (declared-URI `@id` + per-handler resolution)

```
collections/FieldGuide.md  (@id = ni:///sha-256;memexdemoFieldGuideFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
  resolved:   -> ni:///sha-256;memexdemoRedwoodsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  resolved:   -> ni:///sha-256;memexdemoFernsBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  resolved:   -> ni:///sha-256;memexdemoCanopyCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC
notes/Ferns.md  (@id = ni:///sha-256;memexdemoFernsBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB)
  resolved:   -> ni:///sha-256;memexdemoRedwoodsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
notes/Redwoods.md  (@id = ni:///sha-256;memexdemoRedwoodsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA)
  resolved:   -> ni:///sha-256;memexdemoFernsBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  resolved:   -> ni:///sha-256;memexdemoCanopyCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC
  resolved:   -> ni:///sha-256;memexdemoSequoiaArchiveEEEEEEEEEEEEEEEEEEEEEEEEEE
  WARNING:    Wildfire [no-match]
```

*What you're seeing:* each document's `@id` is its own declared frontmatter
`uri` — nothing is minted from the path. `Ferns ↔ Redwoods` resolves in
**both** directions because each side's frontmatter names the other by
basename and both basenames are unique in the target map. The
`[[archive/Sequoia]]` path qualifier disambiguates the collision to the
`archive/` copy's declared URI, never the `field/` one. `[[Wildfire]]` has no
declared target anywhere in the vault, so it produces a `no-match` warning and
**no edge**. `[[Ghost]]` never even appears — it's inside a code fence.

### [4] Ingest

```
[4] ingest each blobject (Page + relationships + typed documentRecord) ...
    ingested archive/Sequoia.md
    ingested collections/FieldGuide.md
    ingested field/Sequoia.md
    ingested notes/Canopy.md
    ingested notes/Ferns.md
    ingested notes/Redwoods.md
```

*What you're seeing:* each blobject goes through the **real** `ingestBlobject`
path — the same relationship-write path (`handleMention`) any OP source uses.
Resolved wikilinks (already `{ type:'link', uri }` edges on `octothorpes` from
the handler) become `Link` relationships; the stamped Item hub becomes an
`Item` edge; declared documentRecord keys become typed leaves.

### [5] Typed read-back (one doc by URI)

`GET /get/everything/thorped/debug?s=<uri>&match=exact` (blobject reads take ~10-12s):

```
Redwoods.documentRecord = {
  "encodingFormat": "image/jpeg",
  "contentUrl": "https://cdn.example.org/memex/redwoods.jpg",
  "contentSize": 482913,
  "dateCreated": "2023-08-23T00:00:00.000Z",
  "sha256": "3b1f9c0d2e4a6b8c0d2e4a6b8c0d2e4a6b8c0d2e4a6b8c0d2e4a6b8c0d2e4a6b",
  "addedBy": "memex-demo"
}
contentSize typeof       = number          (declared range: number → JS number)
dateCreated              = 2023-08-23T00:00:00.000Z  (timestamp → ISO)
declared 'uri'           = undefined        (identity → @id, never a documentRecord leaf)
undeclared 'layout'      = undefined        (dropped: not in the profile schema)
undeclared 'permalink'   = undefined        (dropped: not in the profile schema)
frontmatter tags         = ["memexdemo-conifers","memexdemo-trees"]
                           (lifted to hashtags/octo:Term, NOT documentRecord)
```

*What you're seeing:* documentRecord round-trips **typed** — `contentSize` is a JS
`number`, `dateCreated` an ISO timestamp — driven by the profile's declared
`range`. The declared `uri` field itself never leaks into documentRecord: the
handler consumes it as identity (`@id`), not a passthrough leaf. Undeclared
frontmatter is dropped. Frontmatter `tags` are a separate concern: they become
hashtag Terms, not documentRecord.

### [6] Item subtype path

`GET /get/items/posted/debug`:

```
filters.subtype          = Item
Redwoods present         = true
```

*What you're seeing:* the profile declares `Item → /get/items/<by>`, so the Record
carrying an `Item` edge surfaces on the `items` subtype path (use `by=posted` for
Items, **not** `thorped`).

### [7] Relationship persistence (SPARQL ASK)

```
Redwoods -> Ferns Link   = true
unresolved Wildfire edge = false   (expected false — never stored; only a warning)
```

*What you're seeing:* the resolved wikilink landed as a real `octo:Link`
relationship (source-anchored blank node → `octo:url` target). The unresolved
`[[Wildfire]]` produced **no** edge — the "surface it, don't store it"
guarantee, now expressed as `blob.warnings` rather than an "unresolved" report
from a separate pass.

## Inspect in the browser

After a run (before `--clean`), open these on the relay (URL-encode the `ni:`
URIs):

- All Items: <http://localhost:5173/get/items/posted>
- Redwoods by URI:
  `http://localhost:5173/get/everything/thorped?s=ni%3A%2F%2F%2Fsha-256%3Bmemexdemo…&match=exact`

Each returns `{ "results": [ … ] }` with the typed `documentRecord` and the
`octothorpes` edge list.

## Cleanup / reset

```
node demo/run-demo.js --clean
```

Removes every triple keyed on the vault's declared `ni:///sha-256;memexdemo…`
record URIs, the `ni:` Item hub, and the two namespaced tag Terms
(`~/memexdemo-trees`, `~/memexdemo-conifers`). Verify:

```
curl -s 'http://0.0.0.0:7878/query' \
  --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o . FILTER(CONTAINS(STR(?s),"memexdemo")||CONTAINS(STR(?o),"memexdemo")) }' \
  -H 'Accept: application/sparql-results+json'
# → count = 0
```

The runner also cleans up at the **start** of every run, so re-running never
double-writes.

## Notes / gotchas

- **Read surface for one doc:** use `everything/thorped?s=<uri>&match=exact`.
  (`everything/posted?s=…` returns empty for a bare Page — `posted` is not the
  single-subject read.) `items/posted` is the subtype path for Items.
- **Blobject HTTP reads are slow (~10-12s)** — this is the known `/get` pipeline
  overhead, not a demo bug.
- **`buildTargetMap`/`AMBIGUOUS` are not on the core barrel** — import them from
  `packages/core/handlers/markdown/handler.js` directly.
- **`/index` (the live route) is not used here** — this demo drives the core
  markdown pipeline directly so declared-URI resolution + profile-injected
  documentRecord schema are exercised together, mirroring the OP integration
  test `src/tests/c14MemexRoundtrip.test.js`.
