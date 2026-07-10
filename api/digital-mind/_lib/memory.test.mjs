import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemory } from "./memory.mjs";

const enabledConfig = { supabaseUrl: "https://x.supabase.co", supabaseKey: "svc-key" };
const disabledConfig = { supabaseUrl: undefined, supabaseKey: undefined };

function recorder(ok = true) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined });
    return { ok, status: ok ? 200 : 500, json: async () => [], text: async () => "err" };
  };
  return { calls, fetchImpl };
}

test("disabled without Supabase; writes no-op, reads throw", async () => {
  const mem = createMemory(disabledConfig, { logger: () => {} });
  assert.equal(mem.enabled, false);
  await mem.saveTurn({ conversationId: "c1", userText: "hi", assistantText: "yo" }); // no throw
  await mem.logUsage({ conversationId: "c1", model: "m", usage: {} }); // no throw
  await assert.rejects(() => mem.listConversations(), /not configured/);
});

test("saveTurn upserts the conversation and inserts both messages", async () => {
  const { calls, fetchImpl } = recorder();
  const mem = createMemory(enabledConfig, { fetchImpl });
  await mem.saveTurn({
    conversationId: "c1",
    userText: "what robotics?",
    assistantText: "I built a ROS2 robot.",
    sources: [{ title: "Robots", url: "/posts/robots" }],
  });
  assert.ok(calls.some((c) => /dm_conversations/.test(c.url)));
  const msgCall = calls.find((c) => /dm_messages/.test(c.url));
  assert.ok(msgCall, "posts messages");
  assert.equal(msgCall.body.length, 2);
  assert.equal(msgCall.body[0].role, "user");
  assert.equal(msgCall.body[1].role, "assistant");
  assert.deepEqual(msgCall.body[1].sources, [{ title: "Robots", url: "/posts/robots" }]);
});

test("logUsage records tokens", async () => {
  const { calls, fetchImpl } = recorder();
  const mem = createMemory(enabledConfig, { fetchImpl });
  await mem.logUsage({
    conversationId: "c1",
    model: "kimi-k2-0711-preview",
    usage: { input_tokens: 120, output_tokens: 45 },
    mode: "hybrid+rerank",
  });
  const call = calls.find((c) => /dm_usage/.test(c.url));
  assert.ok(call);
  assert.equal(call.body[0].input_tokens, 120);
  assert.equal(call.body[0].output_tokens, 45);
  assert.equal(call.body[0].retrieval_mode, "hybrid+rerank");
});

test("saveTurn is best-effort — never throws on a failed write", async () => {
  const { fetchImpl } = recorder(false); // all requests fail
  const mem = createMemory(enabledConfig, { fetchImpl, logger: () => {} });
  await mem.saveTurn({ conversationId: "c1", userText: "x", assistantText: "y" }); // must not throw
});

test("saveTurn without a conversationId is skipped", async () => {
  const { calls, fetchImpl } = recorder();
  const mem = createMemory(enabledConfig, { fetchImpl });
  await mem.saveTurn({ conversationId: undefined, userText: "x", assistantText: "y" });
  assert.equal(calls.length, 0);
});

test("admin reads hit the right endpoints", async () => {
  const { calls, fetchImpl } = recorder();
  const mem = createMemory(enabledConfig, { fetchImpl });
  await mem.listConversations({ limit: 5 });
  await mem.getConversation("c1");
  await mem.recentUsage({ limit: 10 });
  assert.ok(calls.some((c) => /dm_conversations\?.*limit=5/.test(c.url)));
  assert.ok(calls.some((c) => /dm_messages\?conversation_id=eq\.c1/.test(c.url)));
  assert.ok(calls.some((c) => /dm_usage\?.*limit=10/.test(c.url)));
});
