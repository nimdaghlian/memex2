# Plan: Install a real OP client in memex2 (replace demo workarounds)

> **Goal:** memex2 consumes `octothorpes` (OP core) as a normal npm dependency with its own client profile, replacing the demo's path-import workarounds (`demo/run-demo.js` imports core via `await import('$OP_REPO/packages/core/index.js')` and reads the OP repo's `.env`).
>
> **Context:** OP epic #240 (merged to `development` via PR #245, plus follow-ups #242/#243 on `240-sprint`) shipped everything memex2 needs: markdown handler + wikilink resolution, profile loader, documentRecord write+read (typed), `Item` subtype path. The working reference implementations are `octothorp.es:src/tests/c14MemexRoundtrip.test.js` and `memex2:demo/run-demo.js` — read both before starting.
>
> **Assumption:** the user publishes the new core to npm before/alongside this work. Current published version is `0.3.1`, which PREDATES all of the above — nothing here works against 0.3.1.

---

## Phase 0 — OP-side pre-publish (do in `~/dev/octothorp.es`, before touching memex2)

These are blockers for a working published package. All verified against `packages/core/` as of 2026-07-08:

- [ ] **Merge the pending second PR** (`240-sprint` → `development`: commits `e996cc3` #242, `6168d15` #243, `bb44c61` createClient passthrough) so the publish source includes tags→hashtags, the write-path wiring, and the client-config passthrough.
- [x] **`files` allowlist + version bump** — done as an uncommitted local edit in `packages/core/package.json` (2026-07-08): `profile.schema.json` added to `files`, version `0.3.1` → `0.3.5`. Commit + include before publishing.
- [x] **`createClient` documentRecord passthrough** — DONE, commit `bb44c61` on `240-sprint`: `createClient({ documentRecordSchema })` forwards to the internal indexer, and `client.get()` uses it as the read default (per-call `documentRecordSchema` in options still wins). memex2 can rely on the config-level injection; no per-call footgun.
- [ ] **`npm pack --dry-run`** and confirm the tarball contains: `profile.js`, `profile.schema.json`, `handlers/markdown/handler.js`, `handlers/markdown/wikilinks.js`, and that `dependencies` lists `js-yaml` and `ajv` (both added during #240 — they are there; just confirm). Note: `wikilinkResolution.js` no longer exists — it was removed in #246 when resolution moved into the markdown handler.
- [ ] **Add a subpath export.** The package `exports` map currently only exposes `.` (`"exports": { ".": "./index.js" }` in `packages/core/package.json`). `buildTargetMap`/`AMBIGUOUS` live on `handlers/markdown/handler.js`, NOT the core barrel, and Node's `exports` map blocks deep imports of anything not listed. Add a subpath export (e.g. `"./handlers/*": "./handlers/*"`) so `buildTargetMap` is importable from the published package as `octothorpes/handlers/markdown/handler.js`. **Decision pending with the user's package.json edit** — do not assume this is done; verify before Phase 1.
- [ ] **Publish** (user does this — mind the standing npm-token rule: `.npmrc` stays gitignored, never committed; a dead token 401s and silently degrades `package-lock.json`).
- [ ] **Smoke the published artifact** from a temp dir:
  `npm i octothorpes@0.4.0` then a node one-liner importing `{ createClient, createProfile, harmonizeSource }` from the package root, and `{ buildTargetMap, AMBIGUOUS }` from the `handlers/markdown/handler.js` subpath (the export added above), plus loading `octothorpes/profile.schema.json`-equivalent via `createRequire`/fs from the installed package. All must resolve. (`resolveWikilinks`/`applyResolution` no longer exist post-#246 — do not smoke-test them.)

## Phase 1 — memex2 install + config

- [ ] `npm i octothorpes@^0.4.0` in `~/dev/memex2`.
- [ ] **memex2's own `profile.json`** at repo root. memex2 is an OP *client* — it declares its own vocabulary, distinct from octothorp.es's. Copy the shape from `octothorp.es:profile.json` (schema is closed, `additionalProperties: false` — stick to declared fields). Must declare:
  - `vocabulary.relationshipSubtypes`: `{ "type": "Item", "label": "is an item in", "path": "items" }` (add others as the spec requires, e.g. `AliasOf` if used)
  - `vocabulary.documentRecord`: the six predicates Memex writes — `encodingFormat` (schema/literal), `contentUrl` (schema/uri), `contentSize` (schema/number), `dateCreated` (schema/timestamp), `sha256` (schema/literal), `addedBy` (memex/literal)
  - `relay: null` (loader-resolved), `name`, `description`, the rest per schema
  - **No secrets.** Known open vocab question: `sha256` sits under the `schema` namespace but schema.org has no such property — fine for now (namespace→IRI resolution treats it as a prefix), tracked as a vocab-layer decision in OP.
  - Validate it against the schema shipped in the package (vitest or a tiny script; mirror `octothorp.es:src/tests/profile-schema.test.js`).
- [ ] **Config split:** relay URL and non-secret settings go in `memex.config.yml` (e.g. `op.relay: http://localhost:5173/` for dev); SPARQL endpoint + basic-auth write credentials go in memex2's own `.env` (create `.env.example`; gitignore `.env`). The demo's habit of reading `$OP_REPO/.env` dies here.

## Phase 2 — the client module

- [ ] Create `src/op/client.js` (adjust to memex2's actual src conventions): a thin adapter that
  1. loads `profile.json` + the packaged schema and calls `createProfile({ profile, schema, instance: <relay from config>, env: process.env })` → `getProfile()`
  2. calls `createClient({ instance, sparql: <endpoint+creds from .env>, documentRecordSchema: getProfile().vocabulary.documentRecord, ... })` (if Phase 0's passthrough was skipped, inject per-call at every `ingestBlobject` instead — do not silently drop it)
  3. exposes what memex2 workflows need: `harmonize(content, { mode: 'markdown', uriField, wikilinkTargets })`, `buildTargetMap`/`AMBIGUOUS` (re-exported from the `handlers/markdown/handler.js` subpath — **not** the package root; requires the Phase 0 `exports` subpath addition), ingest, and reads.
  - **Resolution model note (#246):** `resolveWikilinks`/`applyResolution`/`buildResolutionIndex` no longer exist — they were removed when resolution moved into the markdown handler. There is no whole-instance pass to re-export. The client module's harmonize step must build a `wikilinkTargets` map once per vault walk (via `buildTargetMap`) and pass it straight into `harmonize()`'s options; resolved edges land on `blob.octothorpes` directly and no-match/ambiguous links land on `blob.warnings` — nothing to "apply" afterward.
- [ ] **Ingest path decision (decide, don't drift):** MVP = **direct ingest** (core indexer writes to the SPARQL store — what the demo and C14 do; requires store write creds; fits local-first). Relay-mediated HTTP `/index` is the federation-friendly alternative but requires the `.md` to be fetchable at a URL and has a dispatch gotcha: `as=default` forces HTML mode — pass an unknown harmonizer id so dispatch falls through to content-type `text/markdown`. Document whichever is chosen in the module.
- [ ] **Reads:** HTTP against the relay. Known behavior (demo-verified): single-doc typed documentRecord reads use `get/everything/thorped?s=<url>&match=exact` — `everything/posted?s=` returns 0 for bare Pages. Collection/subtype reads: `get/items/posted` (use `posted`/link-type `by`, never `thorped`, for Items). Blobject pipeline calls run ~10–12s (known OP overhead) — settle/timeout accordingly.

## Phase 3 — port the demo onto the real client

- [ ] `demo/run-demo.js`: replace the path-import + env-borrowing with `src/op/client.js`. The vault, the step sequence, and the `--clean` mode stay.
- [ ] Update `demo/DEMO.md` prerequisites (npm install instead of OP-checkout import) and re-verify every step's pasted output still matches. The demo is now the client's acceptance test.

## Phase 4 — verification (all must pass before calling it done)

- [ ] Fresh-clone-style check: `rm -rf node_modules && npm ci` in memex2, then the full demo runs green with NO reference to `~/dev/octothorp.es` (grep the demo/client for the path to prove it).
- [ ] Demo assertions unchanged: typed `contentSize` (JS number), `dateCreated` ISO; declared `uri` becomes `@id` and never leaks into documentRecord; undeclared frontmatter dropped; mutual links resolve both ways; `[[Wildfire]]` surfaces as a `no-match` warning on `blob.warnings` and is provably absent from the store (SPARQL ASK false); basename collision disambiguated via the qualified path key; tags land as hashtag strings on `octothorpes` (0.4.0 behavior, #243); `/get/items/posted` returns the Item.
- [ ] `--clean` leaves zero namespaced triples (COUNT check), twice.

## Out of scope (do not pull in)
- #217 (profile driving createClient/publishers/harmonizers wholesale), RDF-star, federation/Syncthing sync, #241 (ni:-scheme origin guard — relevant only if ni:-identified docs are ever indexed through the mention path; Items *pointing at* ni: hubs is fine and C14-verified), #244 (guard/pagination policy).

## Reference material
- `octothorp.es:src/tests/c14MemexRoundtrip.test.js` — canonical end-to-end usage
- `memex2:demo/run-demo.js` + `demo/DEMO.md` — verified pipeline transcript
- `octothorp.es:src/lib/indexing.js` / `src/lib/profile.js` — the SvelteKit adapters this client module mirrors
- OP issues #240 (epic), #216/#236/#237/#238 (features), #242/#243 (follow-ups in the second PR), #246 (declared-URI wikilink resolution rework, this doc's Phase 0/2 updates)
