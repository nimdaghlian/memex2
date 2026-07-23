import path from 'node:path';
import { resolveWikilinks, keyOf } from './site/_lib/wikilinks.js';

export default function (eleventyConfig) {
  // site/ is gitignored (the CLI generates into it) and Eleventy respects .gitignore by
  // default — WITHOUT this line the build silently writes 0 files. (node_modules stays ignored.)
  eleventyConfig.setUseGitIgnore(false);

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

  eleventyConfig.addTransform('wikilinks', function (content) {
    if (!isRecord(this.page.inputPath || '')) return content;
    const { text, unresolved } = resolveWikilinks(content, urlFor);
    for (const label of unresolved) {
      console.warn(`[wikilinks] unresolved link [[${label}]] in ${this.page.inputPath}`);
    }
    return text;
  });

  return { dir: { input: 'site', includes: '_includes', output: '_site' } };
}
