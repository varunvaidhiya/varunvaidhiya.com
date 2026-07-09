// Conversation memory + usage logging (Milestone 5).
//
// Server-side persistence of chats and token usage in Supabase, so the admin
// area can review conversations and monitor usage. Writes on the chat path are
// best-effort — they never throw to the caller, so a memory outage can't break
// a conversation. Reads (used by the admin API) surface errors. Requires the
// same SUPABASE_URL + service-role key as hybrid retrieval; when absent, memory
// is simply disabled and the chat works exactly as before. `fetchImpl` is
// injectable for tests. Schema: supabase/migrations/*_memory.sql.

/**
 * @param {import("./config.mjs").DigitalMindConfig} config
 * @param {{ fetchImpl?: typeof fetch, logger?: (msg: string, err?: unknown) => void }} [deps]
 */
export function createMemory(config, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = (config.supabaseUrl ?? "").replace(/\/$/, "");
  const key = config.supabaseKey ?? "";
  const enabled = Boolean(base && key);
  const log = deps.logger ?? ((m, e) => console.warn(`[digital-mind] ${m}`, e ?? ""));

  const headers = (extra = {}) => ({
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  });

  async function insert(table, rows, prefer = "return=minimal") {
    const res = await fetchImpl(`${base}/rest/v1/${table}`, {
      method: "POST",
      headers: headers({ Prefer: prefer }),
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`${table} insert failed (${res.status})`);
  }

  async function select(pathAndQuery) {
    const res = await fetchImpl(`${base}/rest/v1/${pathAndQuery}`, { headers: headers() });
    if (!res.ok) throw new Error(`query failed (${res.status})`);
    return res.json();
  }

  return {
    enabled,

    /** Best-effort: persist one user+assistant turn. Never throws. */
    async saveTurn({ conversationId, userText, assistantText, sources }) {
      if (!enabled || !conversationId) return;
      try {
        const now = new Date().toISOString();
        await insert(
          "dm_conversations",
          [{ id: conversationId, updated_at: now }],
          "resolution=merge-duplicates,return=minimal",
        );
        await insert("dm_messages", [
          { conversation_id: conversationId, role: "user", content: userText, created_at: now },
          {
            conversation_id: conversationId,
            role: "assistant",
            content: assistantText,
            sources: sources ?? [],
            created_at: now,
          },
        ]);
      } catch (err) {
        log("memory: saveTurn failed", err);
      }
    },

    /** Best-effort: record token usage for a turn. Never throws. */
    async logUsage({ conversationId, model, usage, mode }) {
      if (!enabled) return;
      try {
        await insert("dm_usage", [
          {
            conversation_id: conversationId ?? null,
            model,
            input_tokens: usage?.input_tokens ?? 0,
            output_tokens: usage?.output_tokens ?? 0,
            retrieval_mode: mode ?? null,
          },
        ]);
      } catch (err) {
        log("memory: logUsage failed", err);
      }
    },

    // --- Admin reads (surface errors) ----------------------------------------

    async listConversations({ limit = 20 } = {}) {
      if (!enabled) throw new Error("memory not configured");
      return select(
        `dm_conversations?select=id,created_at,updated_at&order=updated_at.desc&limit=${limit}`,
      );
    },

    async getConversation(id) {
      if (!enabled) throw new Error("memory not configured");
      return select(
        `dm_messages?conversation_id=eq.${encodeURIComponent(id)}&select=role,content,sources,created_at&order=created_at.asc`,
      );
    },

    async recentUsage({ limit = 500 } = {}) {
      if (!enabled) throw new Error("memory not configured");
      return select(
        `dm_usage?select=model,input_tokens,output_tokens,retrieval_mode,created_at&order=created_at.desc&limit=${limit}`,
      );
    },

    // --- Settings (dm_config key/value) — used by the admin prompt editor -----

    /** Read a stored setting value (string), or undefined. Best-effort. */
    async getSetting(settingKey) {
      if (!enabled) return undefined;
      try {
        const rows = await select(
          `dm_config?key=eq.${encodeURIComponent(settingKey)}&select=value&limit=1`,
        );
        return Array.isArray(rows) && rows[0] ? rows[0].value : undefined;
      } catch (err) {
        log("memory: getSetting failed", err);
        return undefined;
      }
    },

    /** Upsert a setting value. Throws (admin surfaces the error). */
    async putSetting(settingKey, value) {
      if (!enabled) throw new Error("memory not configured");
      await insert(
        "dm_config",
        [{ key: settingKey, value, updated_at: new Date().toISOString() }],
        "resolution=merge-duplicates,return=minimal",
      );
    },
  };
}
