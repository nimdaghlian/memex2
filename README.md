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

Then open **`http://localhost:8080/`** in a browser — the home page lists your galleries. Click one (e.g. `fallen-trees`) to see the whole gallery, where each image links to its own page at `/items/<name>/`. Leave `serve:site` running and it rebuilds automatically as you edit the `.md` files.

Tags you add to a Record's frontmatter appear at `/tags/<tag>/`, and `[[wikilinks]]` in a Record's body become links between pages.

(To build once without serving: `npm run build:site` → static output in `_site/`.)

New here? [`docs/getting-started.md`](docs/getting-started.md) walks the whole thing end to end in about a minute.

## Serving the Library: embedded or external

Two `memex.config.yml` fields decide who serves your assets. Both are optional and default to today's behavior, so an existing config needs no changes.

```yaml
library: ./library      # where the assets live on disk
libraryMode: embedded   # or: external
libraryUrl: /library/   # URL prefix for every Record's asset link
```

**Embedded** is the default. Eleventy copies your Library into `_site/library` at build time and serves it alongside the pages. Nothing else to set up. The catch is that a `build` or a `--watch` session re-copies the whole Library every time something changes — fine for a few hundred files, painful once it's large. (An `eleventy --serve` session is exempt; it serves from source.)

**External** means the Library lives wherever you want and something else serves it — nginx, a CDN, any static file server. Memex never copies those bytes. It only writes URLs pointing at them, so build time stops scaling with Library size.

Setting it up is a config change and a file move. Your Records don't change: `process` has always written each `path:` relative to the Library root, so as long as the new root has the same gallery directories as its immediate children, every existing path still resolves.

```yaml
libraryMode: external
library: /mnt/photos/library              # anywhere readable; never copied
libraryUrl: https://assets.example.com/   # wherever your server answers
```

A trailing slash gets added to `libraryUrl` if you leave it off. Record paths that are already absolute (`/…` or `https://…`) pass through untouched, so a `cover:` can point outside the Library.

**External mode changes what the build needs, not what the CLI needs.** `process`, `tag`, `verify`, and `update` all still read the Library off the filesystem at `library:`. That path has to stay locally readable — a mount, a Syncthing folder, whatever. If the Library only exists on a remote server, the site builds fine but the CLI stops working.

Memex doesn't set up or health-check your server. A wrong `libraryUrl` shows up as 404s in the browser, not as a build error.

### Testing external mode locally

Serve the Library from a second port and point the site at it. Two terminals:

```sh
# Terminal 1 — stands in for your real web server.
cp -r site/library /tmp/memex-library
python3 -m http.server 8081 --directory /tmp/memex-library
```

Set these three fields in `memex.config.yml`:

```yaml
library: /tmp/memex-library
libraryMode: external
libraryUrl: http://localhost:8081/
```

```sh
# Terminal 2
npm run serve:site
```

Open `http://localhost:8080/`, click into any Record, and check four things:

- The asset link points at port **8081**, not 8080.
- The file loads. This is the real test — it proves the `path:` in each Record still resolves against the new root.
- `ls _site/library` reports no such file. Nothing was copied, which is the whole point.
- Terminal 1 logs the request. A 404 there usually means the Library root is at the wrong depth — check that `ls /tmp/memex-library` lists your gallery directories, not a single `library` directory. `cp -r src dst` nests when `dst` already exists, so re-running the copy is the easy way to get this wrong; `rm -rf /tmp/memex-library` first, or use `rsync -a site/library/ /tmp/memex-library/` with both trailing slashes.

Put your original `library:` back and drop the two new fields to return to embedded mode.

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
