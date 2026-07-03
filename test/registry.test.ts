import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRegistry, resolveRepoPath } from "../src/config/registry";

describe("registry", () => {
  let dir: string;
  const write = (name: string, body: string) => {
    const p = join(dir, name);
    writeFileSync(p, body, "utf8");
    return p;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gardener-reg-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("loads repos with per-entry overrides", () => {
    const p = write(
      "repos.yml",
      [
        "repos:",
        "  - path: ../app",
        "  - path: ./svc",
        "    rules: [typo, unused_import]",
        "    create_pr: true",
        "    max_prs: 2",
      ].join("\n"),
    );
    const reg = loadRegistry(p);
    expect(reg.repos).toHaveLength(2);
    expect(reg.baseDir).toBe(dir);
    expect(reg.repos[1].rules).toEqual(["typo", "unused_import"]);
    expect(reg.repos[1].create_pr).toBe(true);
    expect(reg.repos[1].max_prs).toBe(2);
  });

  it("resolves repo paths relative to the registry dir", () => {
    expect(resolveRepoPath(dir, "../app")).toBe(resolve(dir, "../app"));
    expect(resolveRepoPath(dir, "./svc")).toBe(join(dir, "svc"));
  });

  it("throws on a missing file", () => {
    expect(() => loadRegistry(join(dir, "nope.yml"))).toThrow(/not found/);
  });

  it("throws on an invalid entry", () => {
    const p = write("bad.yml", "repos:\n  - rules: [typo]\n"); // no path
    expect(() => loadRegistry(p)).toThrow(/invalid registry/);
  });

  it("defaults to an empty repo list", () => {
    const p = write("empty.yml", "repos: []\n");
    expect(loadRegistry(p).repos).toEqual([]);
  });
});
