// Runtime configuration for the Digital Mind backend.
//
// All secrets and provider settings live server-side (Vercel env vars) and are
// never shipped to the browser. Defaults follow the project rule of using the
// latest, most capable Claude model; override per-deployment via env.

/**
 * @returns {{
 *   provider: string,
 *   model: string,
 *   maxTokens: number,
 *   topK: number,
 *   maxHistory: number,
 *   hasApiKey: boolean,
 * }}
 */
export function getConfig() {
  const toInt = (value, fallback) => {
    const n = Number.parseInt(value ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  return {
    provider: process.env.DIGITAL_MIND_PROVIDER ?? "anthropic",
    model: process.env.DIGITAL_MIND_MODEL ?? "claude-opus-4-8",
    maxTokens: toInt(process.env.DIGITAL_MIND_MAX_TOKENS, 1024),
    topK: toInt(process.env.DIGITAL_MIND_TOP_K, 5),
    maxHistory: toInt(process.env.DIGITAL_MIND_MAX_HISTORY, 10),
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
