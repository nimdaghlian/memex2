// Extension → MIME (schema:encodingFormat). Kept small and explicit: the CLI only
// catalogs the media types the Library holds. `mediaType`/category is NOT stored — it is
// derived from this MIME at render time (spec §4), so there is a single source of truth.
export const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  tiff: 'image/tiff', tif: 'image/tiff', heic: 'image/heic', webp: 'image/webp',
  mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', mpeg: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  pdf: 'application/pdf', txt: 'text/plain', epub: 'application/epub+zip', rtf: 'application/rtf',
};

export function mimeForExt(ext) {
  if (!ext) return null;
  return EXT_MIME[String(ext).replace(/^\./, '').toLowerCase()] ?? null;
}

// The category is a pure function of the MIME prefix (spec §4). Anything not image/video/audio
// falls through to "document".
export function mediaCategory(mime) {
  if (typeof mime !== 'string') return 'document';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
