import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loader";
import { defaultConfig } from "../src/config/schema";

describe("config", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gardener-cfg-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses safe defaults when no config file exists", () => {
    const { config, sourcePath } = loadConfig(dir);
    expect(sourcePath).toBeNull();
    expect(config.mode).toBe("safe");
    expect(config.limits.max_prs_per_run).toBe(1);
    expect(config.rules).toContain("unused_import");
    expect(config.exclude).toContain("node_modules/**");
  });

  it("defaultConfig() matches the parsed empty config", () => {
    expect(defaultConfig().limits.max_files_per_pr).toBe(5);
    expect(defaultConfig().min_confidence).toBe(0.6);
  });

  it("reads a custom min_confidence", () => {
    const dir2 = mkdtempSync(join(tmpdir(), "gardener-cfg2-"));
    mkdirSync(join(dir2, ".github"), { recursive: true });
    writeFileSync(
      join(dir2, ".github/codebase-gardener.yml"),
      "min_confidence: 0.85\n",
      "utf8",
    );
    expect(loadConfig(dir2).config.min_confidence).toBe(0.85);
    rmSync(dir2, { recursive: true, force: true });
  });

  it("reads and merges a partial config file", () => {
    mkdirSync(join(dir, ".github"), { recursive: true });
    writeFileSync(
      join(dir, ".github/codebase-gardener.yml"),
      "limits:\n  max_files_per_pr: 2\nrules:\n  - typo\n",
      "utf8",
    );
    const { config, sourcePath } = loadConfig(dir);
    expect(sourcePath).not.toBeNull();
    expect(config.limits.max_files_per_pr).toBe(2);
    // unspecified limit keeps its default
    expect(config.limits.max_changed_lines_per_pr).toBe(200);
    expect(config.rules).toEqual(["typo"]);
  });

  it("throws a clear error on an invalid config", () => {
    mkdirSync(join(dir, ".github"), { recursive: true });
    writeFileSync(
      join(dir, ".github/codebase-gardener.yml"),
      "limits:\n  max_files_per_pr: -3\n",
      "utf8",
    );
    expect(() => loadConfig(dir)).toThrow(/invalid/);
  });
});
