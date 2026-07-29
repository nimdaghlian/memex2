import { serializeRecord } from './record.js';

// A Collection is a Record whose value IS its link set (spec §3): one baseline Collection per
// processed directory, its body a list of [[wikilinks]] to each member Record. "Membership" is
// just "there is a link"; there is no membership subtype. The curator edits this file freely.
//
// The body has two halves split by a `---` rule. ABOVE it is the description — prose, tags,
// wikilinks, anything — and that half renders as the Collection page's content. BELOW it is the
// membership link dump, which the site renders as directory rows instead of a list of links.
// The rule is generated (not curator-added) so every Collection has the description area from
// birth; site/_lib/body.js reads the same convention back out.
export const MEMBERS_RULE = '---';

const DESCRIPTION_HINT =
  '<!-- Describe this collection above the rule. Links below it are its members. -->';

export function buildCollection({ name, members = [], addedBy, tags = [] }) {
  const frontmatter = { title: name, tags };
  const body = [
    DESCRIPTION_HINT,
    '',
    MEMBERS_RULE,
    '',
    members.map((m) => `- [[${m}]]`).join('\n'),
  ].join('\n');
  return serializeRecord(frontmatter, body);
}
