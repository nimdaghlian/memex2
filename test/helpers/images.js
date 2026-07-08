// Synthesized image bytes for tests — no external fixture files. Each carries a real header so
// the dimension probe and MIME/hash paths are genuinely exercised; a `salt` varies the content
// hash so distinct assets get distinct hashes.

const u16be = (n) => [(n >> 8) & 0xff, n & 0xff];

export function pngBytes(width, height, salt = 0) {
  const buf = Buffer.alloc(25);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = salt & 0xff;
  return buf;
}

export function gifBytes(width, height) {
  const buf = Buffer.alloc(10);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

// A minimal but structurally real JPEG: SOI, a JFIF APP0 segment, then SOF0. The leading APP0
// means the probe must walk past a segment to reach the frame header — the same path real photos
// take (which always carry APP0/APP1 before SOF).
export function jpegBytes(width, height, salt = 0) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, ...u16be(height), ...u16be(width), 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  const bytes = [0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9];
  if (salt) bytes.push(salt & 0xff);
  return Buffer.from(bytes);
}
