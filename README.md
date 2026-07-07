# Memex 2.0

A local-first, SSG-integrated [Octothorpes Protocol](https://octothorp.es) client for cataloging content-addressed digital assets in a Syncthing-shared **Library** across personally-trusted machines.

Assets and their content-hash identity sync; **Records are local** to each machine and joined across machines by content hash. No ActivityPub/ATProto bridging.

## Status

Design phase. **Nothing is built yet.** This repo currently holds the design spec, the OP-core dependency checklist, and the reference decisions the design is built on.

## Start here

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
