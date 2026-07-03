/**
 * Greedily group items into chunks whose summed size stays within `budget`.
 * An item larger than the budget on its own gets a chunk to itself (never
 * dropped). Order is preserved.
 */
export function chunkBySize<T>(
  items: T[],
  sizeOf: (item: T) => number,
  budget: number,
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const item of items) {
    const size = Math.max(1, sizeOf(item));
    if (current.length > 0 && used + size > budget) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
