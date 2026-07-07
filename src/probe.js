// Zero-dependency dimension probe for the common raster formats. Reads only header bytes;
// returns { width, height } or null. Never throws on malformed/truncated input — a missing
// dimension degrades gracefully (spec §4 / plan Phase 1).

function probePng(buf) {
  // 8-byte signature, then IHDR: length(4) "IHDR"(4) width(4 BE) height(4 BE).
  if (buf.length < 24) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function probeGif(buf) {
  // "GIF87a"/"GIF89a", then logical screen width/height as little-endian uint16.
  if (buf.length < 10) return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function probeJpeg(buf) {
  // Walk the marker segments until a Start-Of-Frame (SOFn), whose payload carries height/width.
  let offset = 2; // skip SOI (0xFFD8)
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    // SOF0..SOF15, excluding DHT(0xC4), DAC(0xCC), and RSTn — those aren't frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 9 > buf.length) return null;
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    const segLen = buf.readUInt16BE(offset + 2);
    if (segLen < 2) return null;
    offset += 2 + segLen;
  }
  return null;
}

export function probeDimensions(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  try {
    if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return probePng(buf);
    if (buf.toString('ascii', 0, 3) === 'GIF') return probeGif(buf);
    if (buf[0] === 0xff && buf[1] === 0xd8) return probeJpeg(buf);
  } catch {
    return null;
  }
  return null;
}
