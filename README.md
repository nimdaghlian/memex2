# Memex 2.0

A local-first, SSG-integrated [Octothorpes Protocol](https://octothorp.es) client for cataloging content-addressed digital assets in a Syncthing-shared **Library** across personally-trusted machines.

Assets and their content-hash identity sync; **Records are local** to each machine and joined across machines by content hash.

## Status

**The CLI and a local 11ty site are built.** `memex process|tag|update|verify` turn a directory of assets into content-addressed Records, Collections, and an in-directory `manifest.json`, and an [Eleventy](https://www.11ty.dev/) site builds those into browsable pages with resolved `[[wikilinks]]` and tag indexes — all with no dependency on a running OP, Oxigraph, or network. The OP-index push is the next wave. Everything else remains design (spec, OP-core dependency checklist, reference decisions).

## CLI usage

```sh
npm install
cp memex.config.yml.example memex.config.yml   # then set memexId

node bin/memex.js                     # no args → interactive menu-driven wizard
node bin/memex.js process <dir>       # hash a directory → manifest.json + Records + one Collection
node bin/memex.js tag <dir> a,b,c     # add tags to a processed directory's Records
node bin/memex.js update              # baseline Records for assets peers added (scans the Library)
node bin/memex.js verify <dir>        # asset-integrity check vs manifest.json (warn-only)

npm test                          # node --test
```

`process` writes `manifest.json` *into* the asset directory (the tracked/untracked boundary — it syncs with the assets) and generates `.md` Records + a baseline Collection under the configured `out` dir (`./site`). Re-running is incremental and idempotent.

## After you process a gallery — view it in the site

`process` generated a website's worth of pages under `site/`. Build and serve them:

```sh
npm run serve:site
```

Then open **`http://localhost:8080/collections/<gallery-folder>/`** in a browser — e.g. if you processed `library/fallen-trees`, go to `http://localhost:8080/collections/fallen-trees/`. You'll see the whole gallery, and each image links to its own page at `/items/<name>/`. Leave `serve:site` running and it rebuilds automatically as you edit the `.md` files.

Tags you add to a Record's frontmatter appear at `/tags/<tag>/`, and `[[wikilinks]]` in a Record's body become links between pages.

(To build once without serving: `npm run build:site` → static output in `_site/`.)

New here? [`docs/getting-started.md`](docs/getting-started.md) walks the whole thing end to end in about a minute.

## Start here

- [`docs/getting-started.md`](docs/getting-started.md) — the one-minute walkthrough: process a gallery and browse it.
- [`docs/quickstart.md`](docs/quickstart.md) — install the CLI and run `process`/`update`/`verify`, with a full command reference.
- [`docs/specs/2026-07-07-memex2-client-design.md`](docs/specs/2026-07-07-memex2-client-design.md) — the design source of truth.
- [`docs/memex2-op-core-dependencies.md`](docs/memex2-op-core-dependencies.md) — OP-core work this build depends on, in priority order.
- [`docs/reference/`](docs/reference/) — the OP ontology decisions underpinning the design.
- `.claude/skills/memex-client/` — the skill orienting a build session.

## Model in brief

- **Item** — raw bytes; identity `ni:///sha-256;<val>` (RFC 6920); the federation join key; a pure hub.
- **Record** — a markdown file → built page at `/item/<hash>`; the OP blobject subject; the asserting document.
- **Collection** — a Record whose value is its in/out link set; one per processed directory.
- **CLI** — `process` (catalog a directory), `update` (pick up assets others added), `verify` (asset integrity).
- **Federation** — post-MVP; local-first, remote-on-trigger.

## Related

- `~/dev/octothorp.es` — the OP core / Relay this client consumes and depends on.
- `~/dev/make-gals` — the earlier CLI whose logic may be reused for `process`.
