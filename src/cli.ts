import { Command } from "commander";
import { runDoctor } from "./commands/doctor";
import { runInit } from "./commands/init";
import { runRun } from "./commands/run";
import { runScan } from "./commands/scan";
import { logger, setVerbose } from "./logger";

function parseIntOpt(value: string): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) {
    throw new Error(`expected a positive integer, got '${value}'`);
  }
  return n;
}

/** Build and run the CLI. Returns a process exit code. */
export async function main(argv: string[]): Promise<number> {
  let exitCode = 0;
  const program = new Command();

  program
    .name("codebase-gardener")
    .description(
      "Detect low-risk maintenance work and open small, reviewable fix PRs.",
    )
    .version("0.1.0")
    .option("-v, --verbose", "verbose logging", false)
    .hook("preAction", (thisCommand) => {
      if (thisCommand.opts().verbose) setVerbose(true);
    });

  program
    .command("init")
    .description("Create a .github/codebase-gardener.yml config template")
    .option("--repo <path>", "target repository path", ".")
    .action((opts) => {
      exitCode = runInit({ repo: opts.repo });
    });

  program
    .command("doctor")
    .description("Check git / gh / node / Claude auth / repo state")
    .option("--repo <path>", "target repository path", ".")
    .action(async (opts) => {
      exitCode = await runDoctor({ repo: opts.repo });
    });

  program
    .command("scan")
    .description("List maintenance candidates (no branches or PRs)")
    .option("--repo <path>", "target repository path", ".")
    .option("--rules <list>", "comma-separated rule allow-list override")
    .option("--json", "output JSON", false)
    .action(async (opts) => {
      exitCode = await runScan({
        repo: opts.repo,
        json: Boolean(opts.json),
        rules: opts.rules,
      });
    });

  program
    .command("run")
    .description("Scan, plan, apply a small fix branch, optionally open a PR")
    .option("--repo <path>", "target repository path", ".")
    .option("--dry-run", "show planned changes without writing anything", false)
    .option("--create-pr", "push the branch and open a pull request", false)
    .option("--rules <list>", "comma-separated rule allow-list override")
    .option("--max-files <n>", "max files per PR", parseIntOpt)
    .option("--max-changed-lines <n>", "max changed lines per PR", parseIntOpt)
    .option("--max-prs <n>", "max PRs per run", parseIntOpt)
    .option("--mode <mode>", "safety mode (only 'safe' supported)", "safe")
    .option("--json", "emit JSON for dry-run output", false)
    .action(async (opts) => {
      exitCode = await runRun({
        repo: opts.repo,
        dryRun: Boolean(opts.dryRun),
        createPr: Boolean(opts.createPr),
        json: Boolean(opts.json),
        rules: opts.rules,
        maxFiles: opts.maxFiles,
        maxChangedLines: opts.maxChangedLines,
        maxPrs: opts.maxPrs,
      });
    });

  try {
    await program.parseAsync(argv);
  } catch (err) {
    logger.error((err as Error).message);
    return 1;
  }
  return exitCode;
}
