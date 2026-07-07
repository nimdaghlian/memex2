// Best-effort date parse from a trailing MMDDYY stamp in a filename (e.g. IMG_1758_122322.jpeg →
// 2022-12-23). Returns an ISO date or null; feeds schema:dateCreated when present.
const DATE_RE = /(\d{6})(?:-\d+)?\.[^.]+$/;

export function extractDate(filename) {
  const match = filename.match(DATE_RE);
  if (!match) return null;

  const digits = match[1];
  const mm = Number(digits.slice(0, 2));
  const dd = Number(digits.slice(2, 4));
  const yy = Number(digits.slice(4, 6));

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const m = String(mm).padStart(2, '0');
  const d = String(dd).padStart(2, '0');
  return `${2000 + yy}-${m}-${d}`;
}
