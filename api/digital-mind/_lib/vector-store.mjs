// Supabase pgvector store for Digital Mind (Milestone 2).
//
// Thin wrapper over Supabase's REST API: a `match_dm_chunks` RPC for vector
// similarity search (with a visibility filter enforced in SQL) and a bulk
// upsert for ingestion. Requires SUPABASE_URL + a service-role key, both
// server-side only. `fetchImpl` is injectable for tests.
//
// The matching SQL lives in supabase/migrations/ — apply it to your project
// before enabling hybrid retrieval.

/** @typedef {import("./chunk.mjs").Chunk} Chunk */

/**
 * @param {{ supabaseUrl?: string, supabaseKey?: string }} config
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export function createVectorStore(config, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = (config.supabaseUrl ?? "").replace(/\/$/, "");
  const key = config.supabaseKey ?? "";

  function headers(extra = {}) {
    return {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...extra,
    };
  }

  return {
    configured: Boolean(base && key),

    /**
     * Vector similarity search over public-by-default chunks.
     * @param {number[]} embedding
     * @param {{ topK?: number, visibility?: string }} [opts]
     * @returns {Promise<(Chunk & { score: number })[]>}
     */
    async search(embedding, opts = {}) {
      const res = await fetchImpl(`${base}/rest/v1/rpc/match_dm_chunks`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          query_embedding: embedding,
          match_count: opts.topK ?? 5,
          filter_visibility: opts.visibility ?? "public",
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Vector search failed (${res.status}): ${detail.slice(0, 200)}`);
      }
      const rows = await res.json();
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: r.id,
        text: r.text,
        title: r.title,
        url: r.url,
        source: r.source,
        heading: r.heading ?? undefined,
        tags: Array.isArray(r.tags) ? r.tags : [],
        visibility: r.visibility ?? "public",
        score: typeof r.similarity === "number" ? r.similarity : (r.score ?? 0),
      }));
    },

    /**
     * Upsert embedded chunks (ingestion). Rows must include an `embedding`.
     * @param {(Chunk & { embedding: number[] })[]} rows
     */
    async upsert(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const res = await fetchImpl(`${base}/rest/v1/dm_chunks`, {
        method: "POST",
        headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(rows),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Vector upsert failed (${res.status}): ${detail.slice(0, 200)}`);
      }
    },
  };
}
