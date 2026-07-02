import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CONFIG_REL_PATH } from "../config/loader";
import { logger } from "../logger";

const TEMPLATE = `# codebase-gardener configuration (all fields optional; safe defaults apply when omitted)
enabled: true

# safe | (future: aggressive) — only "safe" is honored in the MVP
mode: safe

limits:
  max_files_per_pr: 5
  max_changed_lines_per_pr: 200
  max_prs_per_run: 1

# Which low-risk rules the scanner is allowed to consider.
rules:
  - lint_fix
  - unused_import
  - deprecated_api
  - type_narrowing
  - small_test_addition
  - typo
  - stale_docs

exclude:
  - "node_modules/**"
  - "dist/**"
  - "build/**"
  - "coverage/**"
  - "vendor/**"
  - "migrations/**"
  - "**/*.min.js"

pr:
  draft: true
  branch_prefix: "gardener/"
  labels:
    - "maintenance"
    - "ai-generated"
`;

export interface InitOptions {
  repo: string;
}

/** Write a config template to `.github/codebase-gardener.yml`. */
export function runInit(opts: InitOptions): number {
  const root = resolve(opts.repo);
  const target = join(root, CONFIG_REL_PATH);
  if (existsSync(target)) {
    logger.warn(`${CONFIG_REL_PATH} already exists; not overwriting`);
    return 0;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, TEMPLATE, "utf8");
  logger.info(`created ${CONFIG_REL_PATH}`);
  return 0;
}
