// Retrieval dispatcher for Digital Mind.
//
// One entry point — `createRetriever(config, { chunks }).retrieve(query)` — that
// returns lexical (BM25) results by default, or fused lexical+vector (hybrid)
// results when hybrid retrieval is configured. The public shape is identical to
// Milestone 1's lexical retriever, so callers (the chat endpoint) don't change.
//
// Hybrid is resilient: if embedding or the vector store fails for any reason, it
// degrades gracefully to lexical results rather than breaking the conversation.

import { buildRetriever } from "./retrieve.mjs";
import { getEmbeddingsProvider } from "./embeddings.mjs";
import { createVectorStore } from "./vector-store.mjs";
import { reciprocalRankFusion } from "./hybrid.mjs";

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

  return {
    mode: hybrid ? "hybrid" : "lexical",

    /**
     * @param {string} query
     * @param {{ topK?: number }} [opts]
     * @returns {Promise<(Chunk & { score: number })[]>}
     */
    async retrieve(query, opts = {}) {
      const topK = opts.topK ?? config.topK;
      const lexicalResults = lexical.retrieve(query, { topK });

      if (!hybrid || !hybrid.vectorStore.configured) return lexicalResults;

      try {
        const [embedding] = await hybrid.embeddings.embed([query]);
        if (!embedding) return lexicalResults;
        const vectorResults = await hybrid.vectorStore.search(embedding, { topK });
        // TODO(milestone 2b): optional cross-encoder / hosted re-ranking pass
        // over the fused set before returning (needs a reranker provider choice).
        return reciprocalRankFusion([lexicalResults, vectorResults], {
          topK,
          keyOf: (c) => c.url + "#" + (c.id ?? ""),
        });
      } catch (err) {
        log("hybrid retrieval failed; falling back to lexical", err);
        return lexicalResults;
      }
    },
  };
}
