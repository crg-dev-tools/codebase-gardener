import { resolve } from "node:path";
import { claudeCliAvailable } from "../claude/adapter";
import { hasApiKey } from "../claude/client";
import { ShellGitClient } from "../git/client";
import { GhCliClient } from "../github/client";
import { logger } from "../logger";
import { commandExists } from "../util/exec";

export interface DoctorOptions {
  repo: string;
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** Report on git / gh / node / API key / working-tree readiness. */
export async function runDoctor(opts: DoctorOptions): Promise<number> {
  const root = resolve(opts.repo);
  const git = new ShellGitClient(root);
  const gh = new GhCliClient(root);
  const checks: Check[] = [];

  // node
  checks.push({
    name: "node",
    ok: true,
    detail: process.version,
  });

  // git binary + repo state
  const gitOk = await commandExists("git", root);
  let gitDetail = "not found on PATH";
  if (gitOk) {
    const isRepo = await git.isRepo();
    if (!isRepo) {
      gitDetail = "installed, but not a git repository here";
    } else {
      const branch = await git.currentBranch();
      const clean = await git.isClean();
      gitDetail = `repo on '${branch ?? "detached"}' (${clean ? "clean" : "dirty"})`;
    }
  }
  checks.push({ name: "git", ok: gitOk, detail: gitDetail });

  // gh CLI + auth
  const ghOk = await gh.isAvailable();
  let ghDetail = "not found on PATH (PR creation disabled)";
  if (ghOk) {
    const authed = await gh.isAuthenticated();
    ghDetail = authed ? "installed and authenticated" : "installed, NOT authenticated";
  }
  checks.push({ name: "gh", ok: ghOk, detail: ghDetail });

  // Claude backend: prefer the Claude Code CLI (reuses claude.ai login),
  // fall back to an API key.
  const cliOk = await claudeCliAvailable(root);
  const apiOk = hasApiKey();
  let claudeDetail: string;
  if (cliOk) {
    claudeDetail = "Claude Code CLI found (uses your claude.ai login)";
  } else if (apiOk) {
    claudeDetail = "ANTHROPIC_API_KEY set (Anthropic API backend)";
  } else {
    claudeDetail =
      "no backend: install the `claude` CLI and log in, or set ANTHROPIC_API_KEY";
  }
  checks.push({ name: "claude", ok: cliOk || apiOk, detail: claudeDetail });

  for (const c of checks) {
    const mark = c.ok ? "ok  " : "warn";
    logger.info(`[${mark}] ${c.name.padEnd(7)} ${c.detail}`);
  }

  // git and node are required; gh + claude are optional but warned about.
  const required = checks.filter((c) => c.name === "git" || c.name === "node");
  const allRequiredOk = required.every((c) => c.ok);
  return allRequiredOk ? 0 : 1;
}
