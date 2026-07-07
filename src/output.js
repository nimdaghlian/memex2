const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

export const fmt = {
  ok: (msg) => `  ${DIM}✓${RESET}  ${msg}\n`,
  info: (msg) => `  ${DIM}→${RESET}  ${msg}\n`,
  warn: (msg) => `  ${BOLD}!${RESET}  ${msg}\n`,
  err: (msg) => `  ${BOLD}✗${RESET}  ${msg}\n`,
};

export const ok = (msg) => process.stdout.write(fmt.ok(msg));
export const info = (msg) => process.stdout.write(fmt.info(msg));
export const warn = (msg) => process.stdout.write(fmt.warn(msg));
export const err = (msg) => process.stderr.write(fmt.err(msg));
