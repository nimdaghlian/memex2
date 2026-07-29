import path from 'node:path';
import figlet from 'figlet';
import { resolveWikilinks, extractWikilinks, keyOf } from './site/_lib/wikilinks.js';
import { membersSection, descriptionSection } from './site/_lib/body.js';
import { mimeForExt, mediaCategory } from './src/mime.js';

export default function (eleventyConfig) {
  // site/ is gitignored (the CLI generates into it) and Eleventy respects .gitignore by
  // default — WITHOUT this line the build silently writes 0 files. (node_modules stays ignored.)
  eleventyConfig.setUseGitIgnore(false);

  // Serve the asset Library. It lives at site/library/ (synced by a separate service, not git)
  // and is copied verbatim to _site/library/ → reachable at /library/<gallery>/<file>. This is
  // what makes each Record's asset link resolvable in the browser (see site/_data/site.json's
  // libraryPrefix = "/library/"). Images aren't a template format, so without this passthrough
  // Eleventy would ignore them.
  eleventyConfig.addPassthroughCopy({ 'site/library': 'library' });

  // lewk (framework) + site.css (our overlay, loaded after so it can use lewk's tokens).
  // lewk.css/themer.js are vendored copies from ~/dev/lewk — edit them THERE, then re-copy.
  eleventyConfig.addPassthroughCopy({ 'site/_assets': 'assets' });

  // Records and Collections share ONE flat basename→url namespace (last-writer-wins if an item
  // and a collection ever slug identically — an acceptable edge for this chunk).
  const isRecord = (p) => p.includes('/items/') || p.includes('/collections/');

  const urlFor = new Map(); // flat basename-key → permalink, rebuilt each build

  eleventyConfig.on('eleventy.contentMap', ({ inputPathToUrl }) => {
    urlFor.clear();
    for (const [inputPath, urls] of Object.entries(inputPathToUrl)) {
      if (!isRecord(inputPath)) continue; // Records + Collections only
      const slug = path.basename(inputPath, path.extname(inputPath));
      urlFor.set(keyOf(slug), Array.isArray(urls) ? urls[0] : urls);
    }
  });

  // Listing rows: resolve the [[links]] BELOW a Collection's rule to the member Records themselves
  // (not just URLs — the row needs each member's tags, asset path, and body), in authored order.
  // Links above the rule are description prose and stay inline links, not rows.
  eleventyConfig.addFilter('wikilinkMembers', function (rawInput, all) {
    const byKey = new Map();
    for (const p of all || []) {
      const inputPath = p.inputPath || '';
      if (!isRecord(inputPath)) continue;
      byKey.set(keyOf(path.basename(inputPath, path.extname(inputPath))), p);
    }
    return extractWikilinks(membersSection(rawInput))
      .map((label) => byKey.get(keyOf(label)))
      .filter(Boolean);
  });

  // image / video / audio / document, derived from the extension's MIME (spec §4 — the category
  // is never stored). Drives whether a row shows a thumbnail or a glyph.
  eleventyConfig.addFilter('mediaCategory', (assetPath) =>
    mediaCategory(mimeForExt(path.extname(String(assetPath || '')))),
  );

  // The same banner the interactive CLI prints on open (src/interactive.js) — same figlet font,
  // same memexId — so the terminal and the site greet you identically. Rendered at build time;
  // the browser only ever sees the finished text.
  eleventyConfig.addShortcode('ascii', function (text, font) {
    const art = figlet.textSync(String(text || 'memex'), { font: font || 'Slant Relief' });
    const escaped = art.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre class="ascii" role="img" aria-label="${String(text || 'memex')}">${escaped}</pre>`;
  });

  eleventyConfig.addFilter('mime', (assetPath) => mimeForExt(path.extname(String(assetPath || ''))));

  // The image that stands in for a Record anywhere it's shown small. An explicit `cover` (or the
  // spec's `image`, §4 → schema:image) wins over the asset itself — that's what makes a PDF, an
  // audio file, or a video presentable. With neither, only an image asset can represent itself;
  // everything else falls through to a category glyph.
  eleventyConfig.addFilter('poster', (data) => {
    const d = data || {};
    if (d.cover || d.image) return d.cover || d.image;
    const category = mediaCategory(mimeForExt(path.extname(String(d.path || ''))));
    return category === 'image' ? d.path : null;
  });

  eleventyConfig.addFilter('day', (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  });

  // Item Records only — Collections are Records too, but they index the Items, not each other.
  eleventyConfig.addFilter('itemRecords', (all) =>
    (all || []).filter((p) => String(p.url || '').startsWith('/items/')),
  );

  eleventyConfig.addFilter('collectionRecords', (all) =>
    (all || []).filter((p) => String(p.url || '').startsWith('/collections/')),
  );

  // Frontmatter asset references (an Item's `path`, a Collection's `cover`) are Library-relative
  // by default, so they resolve the same way the CLI writes them. An absolute path or full URL is
  // passed through untouched, which lets a cover point outside the Library.
  eleventyConfig.addFilter('assetUrl', (value, prefix) => {
    const v = String(value || '');
    return /^(?:https?:)?\/\//.test(v) || v.startsWith('/') ? v : `${prefix || ''}${v}`;
  });

  // Newest first. Items carry uploadDate from the CLI; Collections fall back to Eleventy's own
  // file date, so a mixed featured list still sorts sensibly.
  eleventyConfig.addFilter('recent', (pages, limit) =>
    [...(pages || [])]
      .sort((a, b) => {
        const at = new Date(a.data?.uploadDate || a.date || 0).getTime();
        const bt = new Date(b.data?.uploadDate || b.date || 0).getTime();
        return bt - at;
      })
      .slice(0, limit || 3),
  );

  // Backlink-ness is derived, never stored (spec §3): a Collection "contains" this Record because
  // its membership half links to it. Same basename key the wikilink resolver uses.
  eleventyConfig.addFilter('linkingCollections', function (page, all) {
    const key = keyOf(path.basename(page.inputPath || '', path.extname(page.inputPath || '')));
    return (all || []).filter((p) => {
      if (!String(p.url || '').startsWith('/collections/')) return false;
      const raw = p.rawInput ?? p.data?.page?.rawInput ?? '';
      return extractWikilinks(membersSection(raw)).some((label) => keyOf(label) === key);
    });
  });

  // A Collection's displayable content is everything above its rule; the link dump below it is
  // structure, re-rendered as directory rows.
  eleventyConfig.addFilter('description', descriptionSection);

  // Runs on every built page, not just Records: listing pages embed member Record bodies, so a
  // [[link]] authored in an Item can surface on a Collection or tag index too.
  eleventyConfig.addTransform('wikilinks', function (content) {
    if (!String(this.page.outputPath || '').endsWith('.html')) return content;
    const { text, unresolved } = resolveWikilinks(content, urlFor);
    for (const label of unresolved) {
      console.warn(`[wikilinks] unresolved link [[${label}]] in ${this.page.inputPath}`);
    }
    return text;
  });

  return { dir: { input: 'site', includes: '_includes', output: '_site' } };
}
