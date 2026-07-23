import { serializeRecord } from './record.js';

// A Collection is a Record whose value IS its link set (spec §3): one baseline Collection per
// processed directory, its body a list of [[wikilinks]] to each member Record. "Membership" is
// just "there is a link"; there is no membership subtype. The curator edits this file freely.
export function buildCollection({ name, members = [], addedBy, tags = [] }) {
  const frontmatter = { title: name, tags };
  const body = members.map(m => `- [[${m}]]`).join('\n');
  return serializeRecord(frontmatter, body);
}
