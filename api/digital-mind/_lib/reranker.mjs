// Re-ranking provider abstraction (Milestone 4).
//
// A cross-encoder re-ranker scores each candidate against the query directly,
// which is more accurate than the first-pass lexical/vector ordering. This
// module exposes one interface — `rerank(query, docs, {topK}) -> docs` — with
// interchangeable providers (Voyage, Cohere). `fetchImpl` is injectable so the
// request/response shaping is unit-testable without network access.

/** @typedef {import("./chunk.mjs").Chunk} Chunk */

const PROVIDERS = {
  voyage: {
    url: "https://api.voyageai.com/v1/rerank",
    defaultModel: "rerank-2",
    keyEnv: "VOYAGE_API_KEY",
    body: (model, query, documents, topK) => ({ model, query, documents, top_k: topK }),
    // { data: [{ index, relevance_score }] }
    parse: (json) => json.data ?? [],
  },
  cohere: {
    url: "https://api.cohere.com/v2/rerank",
    defaultModel: "rerank-english-v3.0",
    keyEnv: "COHERE_API_KEY",
    body: (model, query, documents, topK) => ({ model, query, documents, top_n: topK }),
    // { results: [{ index, relevance_score }] }
    parse: (json) => json.results ?? [],
  },
};

/**
 * @param {import("./config.mjs").DigitalMindConfig} config
 * @param {{ fetchImpl?: typeof fetch, apiKey?: string }} [deps]
 */
export function getReranker(config, deps = {}) {
  const spec = PROVIDERS[config.rerankProvider];
  if (!spec) {
    throw new Error(
      `Unknown rerank provider "${config.rerankProvider}" (expected: ${Object.keys(PROVIDERS).join(", ")})`,
    );
  }
  const model = config.rerankModel || spec.defaultModel;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? process.env[spec.keyEnv];

  return {
    provider: config.rerankProvider,
    model,
    /**
     * @param {string} query
     * @param {(Chunk & { score?: number })[]} docs
     * @param {{ topK?: number }} [opts]
     * @returns {Promise<(Chunk & { score: number })[]>}
     */
    async rerank(query, docs, opts = {}) {
      const topK = opts.topK ?? config.topK;
      if (!Array.isArray(docs) || docs.length === 0) return [];
      if (!apiKey) throw new Error(`Missing ${spec.keyEnv} for rerank provider "${config.rerankProvider}"`);

      const res = await fetchImpl(spec.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(spec.body(model, query, docs.map((d) => d.text), topK)),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Rerank request failed (${res.status}): ${detail.slice(0, 200)}`);
      }
      const ranked = spec.parse(await res.json());
      return ranked
        .filter((r) => docs[r.index])
        // Providers return results sorted by relevance, but sort defensively.
        .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
        .slice(0, topK)
        .map((r) => ({ ...docs[r.index], score: r.relevance_score ?? 0 }));
    },
  };
}

export const SUPPORTED_RERANK_PROVIDERS = Object.keys(PROVIDERS);
