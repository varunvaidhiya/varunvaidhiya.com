// Embeddings provider abstraction for Digital Mind (Milestone 2).
//
// The chat LLM providers (Kimi K2 / Gemini) aren't used for embeddings, so dense
// retrieval has its own provider. This module exposes a single interface —
// `embed(texts) -> number[][]`
// — with interchangeable implementations (Voyage, OpenAI). Pick via env; the
// rest of the system is provider-agnostic. `fetchImpl` is injectable so request
// shaping is unit-testable without network access.

/**
 * @typedef {Object} EmbeddingsProvider
 * @property {string} name
 * @property {string} model
 * @property {number} dimensions
 * @property {(texts: string[]) => Promise<number[][]>} embed
 */

const PROVIDERS = {
  openai: {
    url: "https://api.openai.com/v1/embeddings",
    defaultModel: "text-embedding-3-small",
    keyEnv: "OPENAI_API_KEY",
    build: (model, texts) => ({ model, input: texts }),
    parse: (json) => json.data.map((d) => d.embedding),
  },
  voyage: {
    url: "https://api.voyageai.com/v1/embeddings",
    defaultModel: "voyage-3",
    keyEnv: "VOYAGE_API_KEY",
    build: (model, texts) => ({ model, input: texts }),
    parse: (json) => json.data.map((d) => d.embedding),
  },
};

/**
 * @param {{ embeddingsProvider: string, embeddingsModel?: string, embeddingsDimensions: number }} config
 * @param {{ fetchImpl?: typeof fetch, apiKey?: string }} [deps]
 * @returns {EmbeddingsProvider}
 */
export function getEmbeddingsProvider(config, deps = {}) {
  const spec = PROVIDERS[config.embeddingsProvider];
  if (!spec) {
    throw new Error(
      `Unknown embeddings provider "${config.embeddingsProvider}" (expected: ${Object.keys(PROVIDERS).join(", ")})`,
    );
  }
  const model = config.embeddingsModel || spec.defaultModel;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? process.env[spec.keyEnv];

  return {
    name: config.embeddingsProvider,
    model,
    dimensions: config.embeddingsDimensions,
    async embed(texts) {
      if (!Array.isArray(texts) || texts.length === 0) return [];
      if (!apiKey) throw new Error(`Missing ${spec.keyEnv} for embeddings provider "${spec === PROVIDERS.openai ? "openai" : "voyage"}"`);

      const res = await fetchImpl(spec.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(spec.build(model, texts)),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Embeddings request failed (${res.status}): ${detail.slice(0, 200)}`);
      }
      const json = await res.json();
      const vectors = spec.parse(json);

      // Fail fast on a dimension mismatch — the pgvector column is fixed-width,
      // so an unexpected model/dimension would silently corrupt the index.
      if (vectors[0] && vectors[0].length !== config.embeddingsDimensions) {
        throw new Error(
          `Embedding dimension mismatch: model "${model}" returned ${vectors[0].length}, ` +
            `but DIGITAL_MIND_EMBEDDINGS_DIM is ${config.embeddingsDimensions}. ` +
            `Update the env var and the pgvector column to match.`,
        );
      }
      return vectors;
    },
  };
}

export const SUPPORTED_EMBEDDINGS_PROVIDERS = Object.keys(PROVIDERS);
