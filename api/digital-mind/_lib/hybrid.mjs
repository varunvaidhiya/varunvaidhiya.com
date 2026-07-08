// Reciprocal Rank Fusion (RRF) — merges several ranked result lists into one.
//
// Hybrid search combines lexical (BM25) and dense (vector) retrieval. Their raw
// scores aren't comparable, so we fuse by *rank* instead: each item gets
// sum(1 / (k + rank)) across the lists it appears in. This is robust, tuning-
// light, and the standard way to blend keyword + vector results.
//
// Pure and dependency-free so it is unit-testable and shared across runtimes.

/** @typedef {import("./chunk.mjs").Chunk} Chunk */

/**
 * @param {(Chunk & { score?: number })[][]} lists  Ranked lists (best first).
 * @param {{ k?: number, topK?: number, keyOf?: (c: Chunk) => string }} [opts]
 * @returns {(Chunk & { score: number })[]}  Fused, de-duplicated, best first.
 */
export function reciprocalRankFusion(lists, opts = {}) {
  const k = opts.k ?? 60;
  const topK = opts.topK ?? 5;
  const keyOf = opts.keyOf ?? ((c) => c.id);

  /** @type {Map<string, { chunk: Chunk, score: number }>} */
  const fused = new Map();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    list.forEach((chunk, rank) => {
      if (!chunk) return;
      const key = keyOf(chunk);
      const contribution = 1 / (k + rank + 1); // rank is 0-based
      const existing = fused.get(key);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(key, { chunk, score: contribution });
      }
    });
  }

  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}
