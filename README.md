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

## GitHub backend

PR creation goes through a `GithubClient` interface with two implementations, selected automatically:

1. **`gh` CLI (default)** — uses your ambient `gh` login.
2. **GitHub App (Phase 3 groundwork)** — when `GARDENER_GH_APP_ID`, `GARDENER_GH_APP_PRIVATE_KEY`, and `GARDENER_GH_INSTALLATION_ID` are set, the tool mints a short-lived installation access token (App JWT → installation token) and creates PRs via the GitHub REST API — no `gh` needed. This is the seam a future worker/GitHub-App deployment uses. (Branch **push** still uses local git auth in the MVP; token-injected push is the next step.)

Force with `GARDENER_GITHUB_BACKEND=cli|app`.

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
codebase-gardener doctor        # check git / gh / node / Claude backend / repo state
codebase-gardener init          # write .github/codebase-gardener.yml template
codebase-gardener scan          # list candidates (no branches/PRs)
codebase-gardener run           # scan -> plan -> apply a small branch
codebase-gardener batch         # run the pipeline across many repos (registry)
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

A single `run` can produce several PRs — one coherent PR per rule (so commit messages stay accurate) — up to `max_prs_per_run` (default 1). On a same-day re-run branch names auto-suffix (`-2`, `-3`, …) so they never collide. A formatter (if the repo has one) runs before commit and its output is included.

**Safety:** `run` requires a clean working tree, only acts on low-risk candidates in the configured rule allow-list, enforces file/line/PR limits, honors excluded paths, and defaults to at most one PR per run. If produced edits exceed a limit, the change is rolled back and aborted. Business logic, auth, billing, DB migrations, public API, and large refactors are out of scope by design.

### batch (Phase 2 — multiple repos)

Register repos in a YAML file and run the pipeline across all of them (e.g. from a local cron):

```bash
node dist/index.js batch --registry codebase-gardener.repos.yml --dry-run
node dist/index.js batch --registry codebase-gardener.repos.yml --create-pr
```

```yaml
# codebase-gardener.repos.yml  (paths resolve relative to this file)
repos:
  - path: ../my-app
  - path: ../another-service
    rules: [typo, unused_import]   # per-repo overrides win over batch defaults
    create_pr: true
    max_prs: 2
```

CLI flags (`--dry-run`, `--create-pr`, `--rules`, `--max-files`, `--max-changed-lines`, `--max-prs`) are the defaults; each repo entry may override them. See `codebase-gardener.repos.yml.example`.

## Configuration

Optional. Without a config file, safe defaults apply. See `.github/codebase-gardener.yml.example`, or run `init` to generate one.

```yaml
enabled: true
mode: safe
min_confidence: 0.6   # candidates below this model confidence are skipped by `run`
max_scan_chunks: 8    # cap on scan chunks (model calls) for a large repo
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
| Config loader | `src/config/loader.ts`, `src/config/schema.ts` |
| Batch registry | `src/config/registry.ts`, `src/commands/batch.ts` |
| Repo inspector | `src/repo/inspector.ts` |
| Rule/context loader | `src/repo/rulesContext.ts` |
| Candidate scanner | `src/scan/scanner.ts` |
| Claude adapter | `src/claude/adapter.ts` (interface + backend factory), `src/claude/cliAdapter.ts` (Claude Code CLI), `src/claude/apiAdapter.ts` (Anthropic API) |
| Change planner | `src/plan/planner.ts` |
| Patch applier | `src/apply/applier.ts` |
| Git client | `src/git/client.ts` |
| GitHub client | `src/github/client.ts` (gh CLI), `src/github/appClient.ts` + `appAuth.ts` (App REST), `factory.ts` (backend select) |
| PR body generator | `src/pr/body.ts` |
| Safety guard | `src/safety/guard.ts` |

## Development

```bash
npm test        # vitest unit tests (config, safety guard, planner, glob, JSON extract, rollback)
npm run build   # tsc
```

CI (`.github/workflows/ci.yml`) runs `build` + `test` on every push and PR.

## Known limitations

- **Model-authored edits.** The apply step asks the model for minimal exact-string replacements rather than full file contents, which keeps diffs small. The safety guard still catches the common failure case (Markdown code-fence count changes) and rolls back if an edit drifts.
- **Large repos.** `scan` splits files into size-bounded chunks and scans each, so the whole repo is covered — bounded by `max_scan_chunks` (default 8) to cap model calls. A repo larger than that budget logs how many files were skipped.
- **PR volume.** `run` opens at most `max_prs_per_run` PRs (default 1), one per rule. Raise it deliberately — each PR is a separate branch/commit and, with `--create-pr`, a real pull request.

## License

MIT (see `LICENSE`). Generated changes are AI-assisted; always review before merging.
