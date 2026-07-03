import { describe, expect, it } from "vitest";
import { chunkBySize } from "../src/scan/chunk";

describe("chunkBySize", () => {
  const size = (n: number) => n;

  it("keeps everything in one chunk when it fits", () => {
    expect(chunkBySize([1, 2, 3], size, 100)).toEqual([[1, 2, 3]]);
  });

  it("splits when the budget is exceeded", () => {
    // 40+40 = 80 <= 100; adding 40 -> 120 > 100, so new chunk
    expect(chunkBySize([40, 40, 40], size, 100)).toEqual([[40, 40], [40]]);
  });

  it("gives an oversized item its own chunk, never dropping it", () => {
    expect(chunkBySize([200, 10], size, 100)).toEqual([[200], [10]]);
  });

  it("returns [] for no items", () => {
    expect(chunkBySize([], size, 100)).toEqual([]);
  });

  it("preserves order", () => {
    const out = chunkBySize([60, 60, 60, 60], size, 100);
    expect(out).toEqual([[60], [60], [60], [60]]);
  });
});
