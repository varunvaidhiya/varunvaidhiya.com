// Runtime configuration for the Digital Mind backend.
//
// All secrets and provider settings live server-side (Vercel env vars) and are
// never shipped to the browser. Defaults follow the project rule of using the
// latest, most capable Claude model; override per-deployment via env.

/**
 * @typedef {Object} DigitalMindConfig
 * @property {string} provider
 * @property {string} model
 * @property {number} maxTokens
 * @property {number} topK
 * @property {number} maxHistory
 * @property {boolean} hasApiKey
 * @property {"lexical"|"hybrid"} retrieval
 * @property {string} embeddingsProvider
 * @property {string} [embeddingsModel]
 * @property {number} embeddingsDimensions
 * @property {string} [supabaseUrl]
 * @property {string} [supabaseKey]
 * @property {boolean} hasEmbeddingsKey
 * @property {boolean} hybridEnabled
 * @property {string} rerankProvider
 * @property {string} [rerankModel]
 * @property {number} rerankCandidates
 * @property {boolean} rerankEnabled
 * @property {boolean} memoryEnabled
 * @property {string} [adminToken]
 * @property {boolean} hasAdminToken
 */

/** @returns {DigitalMindConfig} */
export function getConfig(env = process.env) {
  const toInt = (value, fallback) => {
    const n = Number.parseInt(value ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const topK = toInt(env.DIGITAL_MIND_TOP_K, 5);

  const embeddingsProvider = env.DIGITAL_MIND_EMBEDDINGS_PROVIDER ?? "openai";
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_KEY;
  const embeddingsKeyEnv = embeddingsProvider === "voyage" ? "VOYAGE_API_KEY" : "OPENAI_API_KEY";
  const hasEmbeddingsKey = Boolean(env[embeddingsKeyEnv]);

  // "hybrid" retrieval only activates when it can actually work: requested via
  // env AND fully credentialed. Otherwise the system stays on lexical BM25, so a
  // partial configuration never breaks the live chat.
  const retrieval = env.DIGITAL_MIND_RETRIEVAL === "hybrid" ? "hybrid" : "lexical";
  const hybridEnabled = retrieval === "hybrid" && Boolean(supabaseUrl && supabaseKey && hasEmbeddingsKey);

  // Re-ranking (Milestone 4) — dormant unless requested + credentialed.
  const rerankProvider = env.DIGITAL_MIND_RERANK_PROVIDER ?? "voyage";
  const rerankKeyEnv = rerankProvider === "cohere" ? "COHERE_API_KEY" : "VOYAGE_API_KEY";
  const rerankEnabled = env.DIGITAL_MIND_RERANK === "on" && Boolean(env[rerankKeyEnv]);

  // Conversation memory (Milestone 5) — best-effort, on when Supabase is set.
  const memoryEnabled = Boolean(supabaseUrl && supabaseKey);

  // Admin area (Milestone 6) — gated by a shared bearer token.
  const adminToken = env.DIGITAL_MIND_ADMIN_TOKEN;

  return {
    provider: env.DIGITAL_MIND_PROVIDER ?? "anthropic",
    model: env.DIGITAL_MIND_MODEL ?? "claude-opus-4-8",
    maxTokens: toInt(env.DIGITAL_MIND_MAX_TOKENS, 1024),
    topK,
    maxHistory: toInt(env.DIGITAL_MIND_MAX_HISTORY, 10),
    hasApiKey: Boolean(env.ANTHROPIC_API_KEY),

    // Retrieval (Milestone 2 — dormant until fully configured)
    retrieval,
    embeddingsProvider,
    embeddingsModel: env.DIGITAL_MIND_EMBEDDINGS_MODEL,
    embeddingsDimensions: toInt(env.DIGITAL_MIND_EMBEDDINGS_DIM, 1536),
    supabaseUrl,
    supabaseKey,
    hasEmbeddingsKey,
    hybridEnabled,

    // Re-ranking (Milestone 4)
    rerankProvider,
    rerankModel: env.DIGITAL_MIND_RERANK_MODEL,
    rerankCandidates: toInt(env.DIGITAL_MIND_RERANK_CANDIDATES, topK * 4),
    rerankEnabled,

    // Conversation memory (Milestone 5)
    memoryEnabled,

    // Admin (Milestone 6)
    adminToken,
    hasAdminToken: Boolean(adminToken),
  };
}
