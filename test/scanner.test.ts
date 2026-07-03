import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClaudeAdapter } from "../src/claude/adapter";
import { defaultConfig } from "../src/config/schema";
import { scan } from "../src/scan/scanner";
import type { Candidate, FileEdit, RepoContext } from "../src/types";

/** Records which files each scan call received; returns one candidate/file. */
class RecordingAdapter implements ClaudeAdapter {
  calls: string[][] = [];
  async scanCandidates(
    _c: RepoContext,
    _cfg: unknown,
    files: string[],
  ): Promise<Candidate[]> {
    this.calls.push(files);
    return files.map((file) => ({
      rule: "typo",
      file,
      reason: "r",
      risk: "low",
      confidence: 0.9,
      expectedDiff: "d",
    }));
  }
  async planEdits(): Promise<FileEdit[]> {
    return [];
  }
}

describe("scan chunking", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gardener-scan-"));
    mkdirSync(join(dir, "src"), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeFile(rel: string, sizeBytes: number): string {
    writeFileSync(join(dir, rel), "x".repeat(sizeBytes), "utf8");
    return rel;
  }

  function context(files: string[]): RepoContext {
    return {
      root: dir,
      isGitRepo: true,
      defaultBranch: "main",
      packageManager: null,
      languages: ["TypeScript"],
      lintCommand: null,
      testCommand: null,
      formatCommand: null,
      files,
      projectRules: "",
    };
  }

  it("splits large repos into multiple chunks and covers every file", async () => {
    // Each ~50KB (capped at 6KB per-file estimate); budget 90KB -> ~15 files
    // per chunk, so 20 files span 2 chunks.
    const files: string[] = [];
    for (let i = 0; i < 20; i++) files.push(writeFile(`src/f${i}.ts`, 50_000));

    const adapter = new RecordingAdapter();
    const result = await scan(context(files), defaultConfig(), adapter);

    expect(adapter.calls.length).toBeGreaterThan(1);
    // union of scanned files == all files (full coverage)
    const scanned = new Set(adapter.calls.flat());
    expect(scanned.size).toBe(20);
    expect(result).toHaveLength(20);
  });

  it("caps the number of chunks via max_scan_chunks", async () => {
    const files: string[] = [];
    for (let i = 0; i < 40; i++) files.push(writeFile(`src/f${i}.ts`, 50_000));

    const config = defaultConfig();
    config.max_scan_chunks = 1;
    const adapter = new RecordingAdapter();
    await scan(context(files), config, adapter);

    expect(adapter.calls.length).toBe(1);
  });

  it("uses a single chunk for a small repo", async () => {
    const files = [writeFile("src/a.ts", 500), writeFile("src/b.ts", 500)];
    const adapter = new RecordingAdapter();
    await scan(context(files), defaultConfig(), adapter);
    expect(adapter.calls.length).toBe(1);
    expect(adapter.calls[0]).toEqual(files);
  });
});
