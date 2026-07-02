# codebase-gardener

A local-first CLI that detects **small, low-risk maintenance work** in a codebase and opens **small, reviewable fix PRs** — the way Dependabot / Renovate open dependency-update PRs, but for general upkeep.

The goal is not to generate lots of AI review comments. It is to make the tidy-up changes a human wouldn't bother filing an issue for (unused imports, typos, lint fixes, stale docs, deprecated-API swaps) and package them as minimal-diff PRs that CI can verify.

## Status

MVP (Phase 1: local CLI). Scanning and editing are powered by Claude. GitHub operations shell out to `git` and `gh` and are abstracted behind interfaces, so they can be swapped for a GitHub App later.

## Claude backend

Two backends are supported, chosen automatically:

1. **Claude Code CLI (default)** — if the `claude` CLI is installed and you are logged in, the tool reuses your existing **claude.ai login**. No API key needed. This is the default.
2. **Anthropic API** — if the CLI is not present but `ANTHROPIC_API_KEY` is set, it uses the HTTP API (`claude-opus-4-8`, structured outputs).

Force one with `GARDENER_BACKEND=cli` or `GARDENER_BACKEND=api`. Run `doctor` to see which is active.

## Requirements

- Node.js ≥ 18
- `git` on PATH
- A Claude backend: the `claude` CLI (logged in) **or** `ANTHROPIC_API_KEY` — needed for `scan` and `run`
- `gh` CLI, authenticated (only for `--create-pr`)

## Install

```bash
npm install
npm run build
```

This produces `dist/`. Run the CLI with `node dist/index.js <command>` (or `npm link` to get a global `codebase-gardener`).

## Commands

```bash
codebase-gardener doctor        # check git / gh / node / API key / repo state
codebase-gardener init          # write .github/codebase-gardener.yml template
codebase-gardener scan          # list candidates (no branches/PRs)
codebase-gardener run           # scan -> plan -> apply a small branch
```

### scan

```bash
node dist/index.js scan --json
node dist/index.js scan --rules unused_import,typo
```

Lists maintenance candidates with rule / risk / confidence / file / reason. Never creates a branch or PR.

### run

```bash
node dist/index.js run --dry-run           # show proposed edits, write nothing
node dist/index.js run                      # create a branch and commit locally
node dist/index.js run --create-pr          # also push and open a PR (needs gh)
```

Options: `--repo <path>`, `--dry-run`, `--create-pr`, `--rules <a,b>`, `--max-files <n>`, `--max-changed-lines <n>`, `--max-prs <n>`, `--json`.

**Safety:** `run` requires a clean working tree, only acts on low-risk candidates in the configured rule allow-list, enforces file/line/PR limits, honors excluded paths, and defaults to at most one PR per run. If produced edits exceed a limit, the change is rolled back and aborted. Business logic, auth, billing, DB migrations, public API, and large refactors are out of scope by design.

## Configuration

Optional. Without a config file, safe defaults apply. See `.github/codebase-gardener.yml.example`, or run `init` to generate one.

```yaml
enabled: true
mode: safe
limits:
  max_files_per_pr: 5
  max_changed_lines_per_pr: 200
  max_prs_per_run: 1
rules: [lint_fix, unused_import, deprecated_api, type_narrowing, small_test_addition, typo, stale_docs]
exclude: ["node_modules/**", "dist/**", "migrations/**", "**/*.min.js"]
pr:
  draft: true
  branch_prefix: "gardener/"
  labels: [maintenance, ai-generated]
```

Project-specific rule docs (`CLAUDE.md`, `AGENTS.md`, `docs/coding-guidelines.md`, …) are read and passed to the model; explicit project prohibitions take precedence.

## Architecture

| Layer | File |
|---|---|
| CLI | `src/cli.ts`, `src/commands/*` |
| Config loader | `src/config/*` |
| Repo inspector | `src/repo/inspector.ts` |
| Rule/context loader | `src/repo/rulesContext.ts` |
| Candidate scanner | `src/scan/scanner.ts` |
| Claude adapter | `src/claude/adapter.ts` (interface + backend factory), `src/claude/cliAdapter.ts` (Claude Code CLI), `src/claude/apiAdapter.ts` (Anthropic API) |
| Change planner | `src/plan/planner.ts` |
| Patch applier | `src/apply/applier.ts` |
| Git client | `src/git/client.ts` |
| GitHub client | `src/github/client.ts` |
| PR body generator | `src/pr/body.ts` |
| Safety guard | `src/safety/guard.ts` |

## Development

```bash
npm test        # vitest unit tests (config defaults, safety guard)
npm run build   # tsc
```

## License

MIT. Generated changes are AI-assisted; always review before merging.
