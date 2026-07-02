import type { Candidate } from "../types";

/** Render candidates as a JSON string. */
export function candidatesJson(candidates: Candidate[]): string {
  return JSON.stringify({ candidates }, null, 2);
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

/** Render candidates as an aligned text table. */
export function candidatesTable(candidates: Candidate[]): string {
  if (candidates.length === 0) {
    return "No maintenance candidates found.";
  }
  const header =
    pad("RULE", 20) +
    pad("RISK", 7) +
    pad("CONF", 6) +
    pad("FILE", 40) +
    "REASON";
  const rows = candidates.map((c) =>
    pad(c.rule, 20) +
    pad(c.risk, 7) +
    pad(c.confidence.toFixed(2), 6) +
    pad(c.file, 40) +
    c.reason,
  );
  return [header, ...rows].join("\n");
}
