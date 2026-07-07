import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// RFC 6920 (Naming Things with Hashes): the algorithm slug for SHA-256 is "sha-256".
const NI_PREFIX = 'ni:///sha-256;';

function toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

// One helper, both encodings. The digest is expressed twice on purpose (spec §4):
//   hex → the readable `/item/<hex>` permalink and the `schema:sha256` literal
//   ni  → the `ni:///sha-256;<base64url>` identity URI / Item-edge target (federation join key)
export function hashBytes(bytes) {
  const digest = createHash('sha256').update(bytes).digest();
  return { hex: digest.toString('hex'), ni: NI_PREFIX + toBase64Url(digest) };
}

export function hashFile(path) {
  return hashBytes(readFileSync(path));
}

export function hexToNi(hex) {
  return NI_PREFIX + toBase64Url(Buffer.from(hex, 'hex'));
}

export function niToHex(ni) {
  if (typeof ni !== 'string' || !ni.startsWith(NI_PREFIX)) {
    throw new Error(`Not a sha-256 ni: URI: ${ni}`);
  }
  return fromBase64Url(ni.slice(NI_PREFIX.length)).toString('hex');
}
