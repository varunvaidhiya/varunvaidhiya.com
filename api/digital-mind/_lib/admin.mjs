// Admin area — data operations + request handling (Milestone 6).
//
// The admin surface is gated by a single shared bearer token
// (DIGITAL_MIND_ADMIN_TOKEN), suitable for a single-owner site. `createAdmin`
// wraps document storage/indexing (Supabase + embeddings); `handleAdminRequest`
// does auth + action dispatch and returns a plain {status, data} so the thin
// Vercel function (admin.ts) — and unit tests — can drive it without a live
// request. Nothing here is reachable without a valid token.

import { timingSafeEqual } from "node:crypto";
import { chunkDocument } from "./chunk.mjs";
import { getEmbeddingsProvider } from "./embeddings.mjs";

function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function slug(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "doc"
  );
}

function aggregateUsage(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byModel = {};
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of list) {
    inputTokens += r.input_tokens ?? 0;
    outputTokens += r.output_tokens ?? 0;
    const m = r.model ?? "unknown";
    byModel[m] = (byModel[m] ?? 0) + 1;
  }
  return { turns: list.length, inputTokens, outputTokens, byModel };
}

/**
 * @param {import("./config.mjs").DigitalMindConfig} config
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export function createAdmin(config, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = (config.supabaseUrl ?? "").replace(/\/$/, "");
  const key = config.supabaseKey ?? "";
  const supabaseReady = Boolean(base && key);
  const embeddings = config.hybridEnabled ? getEmbeddingsProvider(config, { fetchImpl }) : null;

  const headers = (extra = {}) => ({
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  });

  async function sb(method, pathAndQuery, { body, prefer } = {}) {
    const res = await fetchImpl(`${base}/rest/v1/${pathAndQuery}`, {
      method,
      headers: headers(prefer ? { Prefer: prefer } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`supabase ${method} ${pathAndQuery} failed (${res.status})`);
    const text = await res.text().catch(() => "");
    return text ? JSON.parse(text) : null;
  }

  return {
    supabaseReady,
    canIndexUploads: Boolean(config.hybridEnabled),

    async listDocuments() {
      if (!supabaseReady) return [];
      return sb("GET", "dm_documents?select=id,title,url,tags,created_at&order=created_at.desc&limit=200");
    },

    async uploadDocument({ title, content, url = "", tags = [] }) {
      if (!title || !content) throw new Error("title and content are required");
      if (!config.hybridEnabled) {
        throw new Error("Enable hybrid retrieval (Supabase + an embeddings key) before uploading documents.");
      }
      const docId = `upload/${slug(title)}-${Date.now().toString(36)}`;
      await sb("POST", "dm_documents", {
        body: [{ id: docId, title, content, url, tags, visibility: "public" }],
        prefer: "resolution=merge-duplicates,return=minimal",
      });
      const chunks = chunkDocument({ id: docId, title, url, source: "upload", tags, visibility: "public", body: content });
      const vectors = await embeddings.embed(
        chunks.map((c) => [c.title, c.heading, c.text].filter(Boolean).join("\n")),
      );
      const rows = chunks.map((c, i) => ({ ...c, doc_id: docId, embedding: vectors[i] }));
      await sb("POST", "dm_chunks", { body: rows, prefer: "resolution=merge-duplicates,return=minimal" });
      return { docId, chunks: chunks.length };
    },

    async deleteDocument(docId) {
      if (!docId) throw new Error("docId is required");
      await sb("DELETE", `dm_chunks?doc_id=eq.${encodeURIComponent(docId)}`);
      await sb("DELETE", `dm_documents?id=eq.${encodeURIComponent(docId)}`);
      return { deleted: docId };
    },
  };
}

/**
 * Auth + dispatch. Returns { status, data } — no framework coupling.
 * @param {{ method: string, action?: string, params?: Record<string,string>, body?: any, authHeader?: string }} req
 * @param {{ config: import("./config.mjs").DigitalMindConfig, memory: any, admin: ReturnType<typeof createAdmin> }} ctx
 */
export async function handleAdminRequest(req, ctx) {
  const { config, memory, admin } = ctx;
  if (!config.hasAdminToken) {
    return { status: 503, data: { error: "Admin is not configured. Set DIGITAL_MIND_ADMIN_TOKEN." } };
  }
  const token = (req.authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!safeEqual(token, config.adminToken)) {
    return { status: 401, data: { error: "Unauthorized" } };
  }

  const params = req.params ?? {};
  try {
    if (req.method === "GET") {
      switch (req.action) {
        case "overview": {
          const usage = memory.enabled ? await memory.recentUsage({ limit: 1000 }) : [];
          return {
            status: 200,
            data: {
              memoryEnabled: memory.enabled,
              providers: config.providers,
              defaultProvider: config.defaultProvider ?? null,
              retrievalMode: `${config.hybridEnabled ? "hybrid" : "lexical"}${config.rerankEnabled ? "+rerank" : ""}`,
              embeddings: config.hybridEnabled
                ? `${config.embeddingsProvider}/${config.embeddingsModel ?? "default"}`
                : null,
              canIndexUploads: admin.canIndexUploads,
              usage: aggregateUsage(usage),
            },
          };
        }
        case "conversations":
          return { status: 200, data: memory.enabled ? await memory.listConversations({ limit: 50 }) : [] };
        case "conversation":
          return { status: 200, data: await memory.getConversation(params.id) };
        case "documents":
          return { status: 200, data: await admin.listDocuments() };
        case "prompt":
          return { status: 200, data: { persona: (await memory.getSetting("persona")) ?? "" } };
        default:
          return { status: 400, data: { error: `Unknown action: ${req.action}` } };
      }
    }

    if (req.method === "POST") {
      const action = req.body?.action ?? req.action;
      switch (action) {
        case "prompt":
          await memory.putSetting("persona", String(req.body?.value ?? ""));
          return { status: 200, data: { ok: true } };
        case "upload":
          return { status: 200, data: await admin.uploadDocument(req.body ?? {}) };
        case "deleteDoc":
          return { status: 200, data: await admin.deleteDocument(req.body?.docId) };
        default:
          return { status: 400, data: { error: `Unknown action: ${action}` } };
      }
    }

    return { status: 405, data: { error: "Method not allowed" } };
  } catch (err) {
    return { status: 400, data: { error: err?.message ?? "Admin operation failed" } };
  }
}

export { aggregateUsage };
