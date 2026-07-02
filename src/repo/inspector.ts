import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config/schema";
import type { GitClient } from "../git/client";
import type { RepoContext } from "../types";
import { matchesAny } from "../util/glob";
import { loadProjectRules } from "./rulesContext";

/** File extensions we treat as reviewable source. */
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rb",
  ".java",
  ".rs",
  ".c",
  ".h",
  ".cpp",
  ".cs",
  ".php",
  ".md",
]);

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i).toLowerCase();
}

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detectPackageManager(
  root: string,
): RepoContext["packageManager"] {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  if (existsSync(join(root, "package.json"))) return "npm";
  return null;
}

function detectNodeCommands(
  root: string,
  pm: RepoContext["packageManager"],
): { lint: string | null; test: string | null; format: string | null } {
  const pkg = readJsonSafe(join(root, "package.json"));
  const scripts =
    pkg && typeof pkg.scripts === "object" && pkg.scripts !== null
      ? (pkg.scripts as Record<string, string>)
      : {};
  const runner =
    pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : "npm run";
  const pick = (name: string): string | null =>
    name in scripts ? `${runner} ${name}` : null;
  return {
    lint: pick("lint"),
    test: pick("test"),
    format: pick("format") ?? pick("prettier"),
  };
}

function detectLanguages(files: string[]): string[] {
  const langByExt: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".py": "Python",
    ".go": "Go",
    ".rb": "Ruby",
    ".java": "Java",
    ".rs": "Rust",
    ".c": "C",
    ".cpp": "C++",
    ".cs": "C#",
    ".php": "PHP",
  };
  const found = new Set<string>();
  for (const f of files) {
    const lang = langByExt[extOf(f)];
    if (lang) found.add(lang);
  }
  return [...found].sort();
}

/**
 * Inspect the target repo: git status, package manager, languages, candidate
 * lint/test/format commands, the (excluded-filtered) source file list, and any
 * project-specific rule documents.
 */
export async function inspectRepo(
  root: string,
  git: GitClient,
  config: Config,
): Promise<RepoContext> {
  const isGitRepo = await git.isRepo();
  const defaultBranch = isGitRepo ? await git.currentBranch() : null;

  const allFiles = isGitRepo ? await git.listFiles() : [];
  const files = allFiles.filter(
    (f) => SOURCE_EXTENSIONS.has(extOf(f)) && !matchesAny(f, config.exclude),
  );

  const packageManager = detectPackageManager(root);
  const cmds = detectNodeCommands(root, packageManager);
  const projectRules = loadProjectRules(root);

  return {
    root,
    isGitRepo,
    defaultBranch,
    packageManager,
    languages: detectLanguages(files),
    lintCommand: cmds.lint,
    testCommand: cmds.test,
    formatCommand: cmds.format,
    files,
    projectRules,
  };
}
