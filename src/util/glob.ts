/** Tiny, dependency-free glob matcher supporting `**`, `*` and `?`.
 *  Paths are compared using forward slashes. Matching is case-sensitive. */

function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // `**` matches across path separators.
        re += ".*";
        i++;
        // consume a trailing slash after `**/`
        if (pattern[i + 1] === "/") i++;
      } else {
        // `*` matches within a single path segment.
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

/** Normalize a path to forward slashes. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** True if `path` matches any of the glob `patterns`. */
export function matchesAny(path: string, patterns: string[]): boolean {
  const norm = normalizePath(path);
  return patterns.some((p) => globToRegExp(p).test(norm));
}
