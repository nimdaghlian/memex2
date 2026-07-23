export default function (eleventyConfig) {
  // site/ is gitignored (the CLI generates into it) and Eleventy respects .gitignore by
  // default — WITHOUT this line the build silently writes 0 files. (node_modules stays ignored.)
  eleventyConfig.setUseGitIgnore(false);

  return { dir: { input: 'site', includes: '_includes', output: '_site' } };
}
