import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdmin, handleAdminRequest, aggregateUsage } from "./admin.mjs";

process.env.OPENAI_API_KEY = "sk-test";

const baseConfig = {
  hasAdminToken: true,
  adminToken: "secret",
  model: "claude-opus-4-8",
  hybridEnabled: false,
  rerankEnabled: false,
  embeddingsProvider: "openai",
};

function mockCtx(overrides = {}) {
  const captured = {};
  const memory = {
    enabled: true,
    recentUsage: async () => [{ model: "m", input_tokens: 10, output_tokens: 5 }],
    listConversations: async () => [{ id: "c1" }],
    getConversation: async () => [{ role: "user", content: "hi" }],
    getSetting: async () => "current persona",
    putSetting: async (k, v) => {
      captured.setting = { k, v };
    },
    ...(overrides.memory ?? {}),
  };
  const admin = {
    canIndexUploads: false,
    listDocuments: async () => [{ id: "d1", title: "Doc" }],
    uploadDocument: async (d) => {
      captured.upload = d;
      return { docId: "upload/x", chunks: 3 };
    },
    deleteDocument: async (id) => ({ deleted: id }),
    ...(overrides.admin ?? {}),
  };
  return { ctx: { config: { ...baseConfig, ...(overrides.config ?? {}) }, memory, admin }, captured };
}

test("aggregateUsage sums tokens and counts by model", () => {
  const agg = aggregateUsage([
    { input_tokens: 10, output_tokens: 5, model: "a" },
    { input_tokens: 20, output_tokens: 1, model: "a" },
  ]);
  assert.deepEqual(agg, { turns: 2, inputTokens: 30, outputTokens: 6, byModel: { a: 2 } });
});

test("503 when no admin token is configured", async () => {
  const { ctx } = mockCtx({ config: { hasAdminToken: false } });
  const res = await handleAdminRequest({ method: "GET", action: "overview", authHeader: "Bearer x" }, ctx);
  assert.equal(res.status, 503);
});

test("401 on a wrong or missing token", async () => {
  const { ctx } = mockCtx();
  assert.equal((await handleAdminRequest({ method: "GET", action: "overview", authHeader: "Bearer nope" }, ctx)).status, 401);
  assert.equal((await handleAdminRequest({ method: "GET", action: "overview", authHeader: "" }, ctx)).status, 401);
});

test("overview returns config summary + usage aggregate", async () => {
  const { ctx } = mockCtx();
  const res = await handleAdminRequest({ method: "GET", action: "overview", authHeader: "Bearer secret" }, ctx);
  assert.equal(res.status, 200);
  assert.equal(res.data.model, "claude-opus-4-8");
  assert.equal(res.data.usage.turns, 1);
  assert.equal(res.data.usage.inputTokens, 10);
});

test("conversations + conversation dispatch to memory", async () => {
  const { ctx } = mockCtx();
  assert.deepEqual(
    (await handleAdminRequest({ method: "GET", action: "conversations", authHeader: "Bearer secret" }, ctx)).data,
    [{ id: "c1" }],
  );
  const one = await handleAdminRequest(
    { method: "GET", action: "conversation", params: { id: "c1" }, authHeader: "Bearer secret" },
    ctx,
  );
  assert.equal(one.data[0].content, "hi");
});

test("POST prompt persists the persona; POST upload dispatches", async () => {
  const { ctx, captured } = mockCtx();
  await handleAdminRequest({ method: "POST", body: { action: "prompt", value: "new persona" }, authHeader: "Bearer secret" }, ctx);
  assert.deepEqual(captured.setting, { k: "persona", v: "new persona" });

  const up = await handleAdminRequest(
    { method: "POST", body: { action: "upload", title: "T", content: "C" }, authHeader: "Bearer secret" },
    ctx,
  );
  assert.equal(up.data.chunks, 3);
  assert.equal(captured.upload.title, "T");
});

test("unknown action -> 400", async () => {
  const { ctx } = mockCtx();
  const res = await handleAdminRequest({ method: "GET", action: "nope", authHeader: "Bearer secret" }, ctx);
  assert.equal(res.status, 400);
});

// --- createAdmin document ops -------------------------------------------------

test("uploadDocument refuses without hybrid retrieval", async () => {
  const admin = createAdmin({ ...baseConfig, hybridEnabled: false }, { fetchImpl: async () => ({ ok: true }) });
  await assert.rejects(() => admin.uploadDocument({ title: "T", content: "C" }), /hybrid retrieval/i);
});

test("uploadDocument embeds and upserts when hybrid is enabled", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (/openai\.com/.test(url)) {
      const body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ data: body.input.map(() => ({ embedding: [0, 0, 0, 0] })) }) };
    }
    return { ok: true, text: async () => "" }; // supabase inserts
  };
  const admin = createAdmin(
    {
      ...baseConfig,
      hybridEnabled: true,
      supabaseUrl: "https://x.supabase.co",
      supabaseKey: "k",
      embeddingsProvider: "openai",
      embeddingsDimensions: 4,
    },
    { fetchImpl },
  );
  const res = await admin.uploadDocument({ title: "Robotics Notes", content: "# Notes\n\nROS2 stuff." });
  assert.ok(res.docId.startsWith("upload/"));
  assert.ok(res.chunks >= 1);
  assert.ok(calls.some((u) => /dm_documents/.test(u)));
  assert.ok(calls.some((u) => /dm_chunks/.test(u)));
});
