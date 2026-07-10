// Runtime configuration for the Digital Mind backend.
//
// All secrets and provider settings live server-side (Vercel env vars) and are
// never shipped to the browser. The chat model runs on a user-selectable
// provider — Kimi K2 (Moonshot) or Gemini — both of which expose an
// OpenAI-compatible API, so one client (see llm.mjs) serves both. Only a
// provider *id* ever crosses the wire; keys are read from env here.

/**
 * Provider definitions. Model and base URL are env-overridable so a model-id or
 * endpoint change never needs a code edit. A provider is "configured" (and thus
 * offered in the UI) only when its API key is present.
 */
export const PROVIDER_DEFS = {
  kimi: {
    label: "Kimi K2",
    keyEnv: "MOONSHOT_API_KEY",
    modelEnv: "DIGITAL_MIND_KIMI_MODEL",
    baseUrlEnv: "DIGITAL_MIND_KIMI_BASE_URL",
    defaultModel: "kimi-k2-0711-preview",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
  },
  gemini: {
    label: "Gemini",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "DIGITAL_MIND_GEMINI_MODEL",
    baseUrlEnv: "DIGITAL_MIND_GEMINI_BASE_URL",
    defaultModel: "gemini-2.5-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
};

// Preference order: the first *configured* provider becomes the default when
// DIGITAL_MIND_PROVIDER isn't set. Kimi K2 leads.
const PROVIDER_ORDER = ["kimi", "gemini"];

/**
 * @typedef {Object} ProviderInfo
 * @property {string} id
 * @property {string} label
 * @property {string} model
 *
 * @typedef {ProviderInfo & { apiKey?: string, baseUrl: string, configured: boolean }} ProviderConfig
 *
 * @typedef {Object} DigitalMindConfig
 * @property {number} maxTokens
 * @property {number} topK
 * @property {number} maxHistory
 * @property {Record<string, ProviderConfig>} providerConfigs
 * @property {ProviderInfo[]} providers
 * @property {string|undefined} defaultProvider
 * @property {boolean} hasAnyProvider
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

  // --- LLM providers (Kimi K2 / Gemini) -------------------------------------
  /** @type {Record<string, ProviderConfig>} */
  const providerConfigs = {};
  /** @type {ProviderInfo[]} */
  const providers = [];
  for (const id of PROVIDER_ORDER) {
    const def = PROVIDER_DEFS[id];
    const apiKey = env[def.keyEnv];
    const model = env[def.modelEnv] ?? def.defaultModel;
    const baseUrl = (env[def.baseUrlEnv] ?? def.defaultBaseUrl).replace(/\/$/, "");
    const configured = Boolean(apiKey);
    providerConfigs[id] = { id, label: def.label, model, apiKey, baseUrl, configured };
    if (configured) providers.push({ id, label: def.label, model });
  }
  const requested = env.DIGITAL_MIND_PROVIDER;
  const defaultProvider =
    requested && providerConfigs[requested]?.configured ? requested : providers[0]?.id;

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
    maxTokens: toInt(env.DIGITAL_MIND_MAX_TOKENS, 1024),
    topK,
    maxHistory: toInt(env.DIGITAL_MIND_MAX_HISTORY, 10),

    // LLM providers (user-switchable)
    providerConfigs,
    providers,
    defaultProvider,
    hasAnyProvider: providers.length > 0,

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
