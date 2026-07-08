// Retrieval dispatcher for Digital Mind.
//
// One entry point — `createRetriever(config, { chunks }).retrieve(query)` — that
// returns lexical (BM25) results by default, fused lexical+vector (hybrid) when
// configured, and optionally a re-ranked ordering on top. The public shape is
// identical to Milestone 1's lexical retriever, so callers don't change.
//
// Every optional stage is resilient: if embedding, the vector store, or the
// re-ranker fails for any reason, it degrades to the previous stage's ordering
// rather than breaking the conversation.

import { buildRetriever } from "./retrieve.mjs";
import { getEmbeddingsProvider } from "./embeddings.mjs";
import { createVectorStore } from "./vector-store.mjs";
import { reciprocalRankFusion } from "./hybrid.mjs";
import { getReranker } from "./reranker.mjs";

/** @typedef {import("./chunk.mjs").Chunk} Chunk */

/**
 * @param {import("./config.mjs").DigitalMindConfig} config
 * @param {{ chunks: Chunk[], fetchImpl?: typeof fetch, logger?: (msg: string, err?: unknown) => void }} deps
 */
export function createRetriever(config, deps) {
  const lexical = buildRetriever(deps.chunks);
  const log = deps.logger ?? ((msg, err) => console.warn(`[digital-mind] ${msg}`, err ?? ""));

  const hybrid = config.hybridEnabled
    ? {
        embeddings: getEmbeddingsProvider(config, { fetchImpl: deps.fetchImpl }),
        vectorStore: createVectorStore(config, { fetchImpl: deps.fetchImpl }),
      }
    : null;

  const reranker = config.rerankEnabled ? getReranker(config, { fetchImpl: deps.fetchImpl }) : null;

  const mode = `${hybrid ? "hybrid" : "lexical"}${reranker ? "+rerank" : ""}`;

  return {
    mode,

    /**
     * @param {string} query
     * @param {{ topK?: number }} [opts]
     * @returns {Promise<(Chunk & { score: number })[]>}
     */
    async retrieve(query, opts = {}) {
      const topK = opts.topK ?? config.topK;
      // Re-ranking works best over a larger first-pass candidate pool.
      const poolK = reranker ? Math.max(config.rerankCandidates, topK) : topK;

      let candidates = lexical.retrieve(query, { topK: poolK });

      if (hybrid && hybrid.vectorStore.configured) {
        try {
          const [embedding] = await hybrid.embeddings.embed([query]);
          if (embedding) {
            const vectorResults = await hybrid.vectorStore.search(embedding, { topK: poolK });
            candidates = reciprocalRankFusion([candidates, vectorResults], {
              topK: poolK,
              keyOf: (c) => `${c.url}#${c.id ?? ""}`,
            });
          }
        } catch (err) {
          log("hybrid retrieval failed; using lexical candidates", err);
        }
      }

      if (reranker && candidates.length > 0) {
        try {
          return await reranker.rerank(query, candidates, { topK });
        } catch (err) {
          log("rerank failed; using first-pass order", err);
        }
      }

      return candidates.slice(0, topK);
    },
  };
}
