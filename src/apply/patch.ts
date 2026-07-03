import type { Replacement } from "../types";

export type PatchResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) break;
    count++;
    from = i + needle.length;
  }
  return count;
}

/**
 * Apply a sequence of exact-string replacements to `original`. Each
 * `oldString` must be non-empty and occur EXACTLY once in the current content
 * (after prior replacements). Any failure returns an error and no partial
 * result — the guarantee is that only the matched spans ever change.
 */
export function applyReplacements(
  original: string,
  replacements: Replacement[],
): PatchResult {
  if (replacements.length === 0) {
    return { ok: false, error: "no replacements provided" };
  }
  let content = original;
  for (const [i, r] of replacements.entries()) {
    if (r.oldString === "") {
      return { ok: false, error: `replacement ${i + 1}: empty oldString` };
    }
    const n = countOccurrences(content, r.oldString);
    if (n === 0) {
      return {
        ok: false,
        error: `replacement ${i + 1}: oldString not found`,
      };
    }
    if (n > 1) {
      return {
        ok: false,
        error: `replacement ${i + 1}: oldString is not unique (${n} matches)`,
      };
    }
    // Use a function replacer so `$`-sequences in newString are treated
    // literally (string replacers interpret $&, $1, … as patterns).
    content = content.replace(r.oldString, () => r.newString);
  }
  return { ok: true, content };
}
