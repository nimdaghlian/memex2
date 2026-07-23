export default {
  layout: 'record.njk',
  permalink: '/items/{{ page.fileSlug }}/',
  // We intentionally let the frontmatter `tags` create Eleventy collections — Task 6b renders
  // tag-index pages from them, and the same key powers Obsidian's tag pane. `data.tags` stays
  // available to record.njk. (Do NOT add eleventyExcludeFromCollections here.)
};
