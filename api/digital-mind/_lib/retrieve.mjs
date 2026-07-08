// Framework-free retrieval for the Digital Mind knowledge base.
//
// Milestone 1 uses lexical BM25 over the pre-built chunk index. The public
// surface — `buildRetriever(chunks).retrieve(query, opts)` — is intentionally
// the same shape a vector or hybrid backend will expose later, so swapping in
// pgvector / Qdrant is a drop-in change with no caller edits.

/** @typedef {import("./chunk.mjs").Chunk} Chunk */

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have i in is it its of on or that the their they this to was were what when where which who why will with you your".split(
    " ",
  ),
);

const K1 = 1.5;
const B = 0.75;

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t),
  );
}

/**
 * Build a retriever over a fixed set of chunks. Document statistics are
 * computed once; queries are cheap.
 * @param {Chunk[]} chunks
 */
export function buildRetriever(chunks) {
  const docs = chunks.map((chunk) => {
    const tokens = tokenize(`${chunk.heading ?? ""} ${chunk.text}`);
    /** @type {Map<string, number>} */
    const tf = new Map();
    for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
    return { chunk, tf, length: tokens.length };
  });

  const totalLength = docs.reduce((sum, d) => sum + d.length, 0);
  const avgdl = docs.length ? totalLength / docs.length : 0;

  /** @type {Map<string, number>} */
  const df = new Map();
  for (const doc of docs) {
    for (const term of doc.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const N = docs.length;

  /**
   * @param {string} query
   * @param {{ topK?: number, minScore?: number, visibility?: Chunk["visibility"] }} [opts]
   * @returns {(Chunk & { score: number })[]}
   */
  function retrieve(query, opts = {}) {
    const topK = opts.topK ?? 5;
    const minScore = opts.minScore ?? 0;
    const visibility = opts.visibility ?? "public";
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const scored = [];
    for (const doc of docs) {
      // Security boundary: never surface non-public knowledge to visitors.
      if (doc.chunk.visibility !== visibility) continue;
      let score = 0;
      for (const term of queryTerms) {
        const termFreq = doc.tf.get(term);
        if (!termFreq) continue;
        const n = df.get(term) ?? 0;
        // BM25 idf with the standard +0.5 smoothing (kept non-negative).
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        const denom = termFreq + K1 * (1 - B + (B * doc.length) / (avgdl || 1));
        score += idf * ((termFreq * (K1 + 1)) / denom);
      }
      if (score > minScore) scored.push({ ...doc.chunk, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  return { retrieve };
}
