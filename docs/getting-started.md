# Getting started

Process a gallery with the CLI, then browse it in the local site. Takes about a minute.

## 1. Install

```sh
npm install
```

## 2. Make a config

```sh
cp memex.config.yml.example memex.config.yml
```

The defaults (`out: ./site`, `library: ./library`) are fine. Set `memexId` to any name for this machine.

## 3. Add a gallery

Put some images in a folder under `library/`:

```sh
mkdir -p library/fallen-trees
cp ~/Pictures/trees/*.jpg library/fallen-trees/
```

## 4. Process it

```sh
node bin/memex.js process library/fallen-trees
```

This writes:
- `library/fallen-trees/manifest.json` — the content-hash ledger (stays with your assets)
- `site/items/<name>.md` — one Record per image
- `site/collections/fallen-trees.md` — a Collection linking every image

## 5. Build and serve the site

```sh
npm run serve:site
```

## 6. Find your gallery

Open **http://localhost:8080/collections/fallen-trees/** — the Collection lists every image, each linking to its own page at `/items/<name>/`.

Any `[[wikilinks]]` you add to a Record's `.md` body resolve to those pages, and any `tags:` you add show up at `/tags/<tag>/`.

## Next time

Add more images to the folder and re-run `node bin/memex.js process library/fallen-trees` — it's incremental. Then rebuild with `npm run build:site` (or leave `serve:site` running; it rebuilds on change).
