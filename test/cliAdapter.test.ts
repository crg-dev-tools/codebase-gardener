import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../src/claude/cliAdapter";

describe("extractJsonObject", () => {
  it("returns the object from plain JSON", () => {
    const out = extractJsonObject('{"candidates":[]}');
    expect(out).toBe('{"candidates":[]}');
    expect(JSON.parse(out!)).toEqual({ candidates: [] });
  });

  it("strips ```json fences and surrounding prose", () => {
    const text = 'Here is the result:\n```json\n{"a":1}\n```\nDone.';
    const out = extractJsonObject(text);
    expect(JSON.parse(out!)).toEqual({ a: 1 });
  });

  it("handles nested objects", () => {
    const text = 'prefix {"edits":[{"file":"a.ts","n":{"x":1}}]} suffix';
    const out = extractJsonObject(text);
    expect(JSON.parse(out!)).toEqual({
      edits: [{ file: "a.ts", n: { x: 1 } }],
    });
  });

  it("returns null when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});
