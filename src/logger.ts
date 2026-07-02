/* eslint-disable no-console */

/** Minimal leveled logger. Writes human-facing output to stderr so that
 *  `--json` payloads on stdout stay machine-parseable. */

let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export const logger = {
  info(msg: string): void {
    process.stderr.write(msg + "\n");
  },
  warn(msg: string): void {
    process.stderr.write("warning: " + msg + "\n");
  },
  error(msg: string): void {
    process.stderr.write("error: " + msg + "\n");
  },
  debug(msg: string): void {
    if (verbose) process.stderr.write("debug: " + msg + "\n");
  },
  /** Machine-readable output goes to stdout. */
  out(msg: string): void {
    process.stdout.write(msg + "\n");
  },
};
