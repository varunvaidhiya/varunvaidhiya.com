import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProviderId, streamChat } from "./llm.mjs";

const config = {
  defaultProvider: "kimi",
  providerConfigs: {
    kimi: {
      id: "kimi",
      label: "Kimi K2",
      model: "kimi-k2-0711-preview",
      apiKey: "moon-key",
      baseUrl: "https://api.moonshot.ai/v1",
      configured: true,
    },
    gemini: {
      id: "gemini",
      label: "Gemini",
      model: "gemini-2.5-flash",
      apiKey: "gem-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      configured: true,
    },
    off: { id: "off", label: "Off", model: "x", apiKey: undefined, baseUrl: "https://x", configured: false },
  },
};

/** Build an SSE ReadableStream from frames (objects are JSON-encoded). */
function sseStream(frames) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const f of frames) {
        const data = typeof f === "string" ? f : JSON.stringify(f);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }
      controller.close();
    },
  });
}

async function collect(gen) {
  const out = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

test("resolveProviderId honours a configured request, else falls back to default", () => {
  assert.equal(resolveProviderId(config, "gemini"), "gemini");
  assert.equal(resolveProviderId(config, undefined), "kimi"); // default
  assert.equal(resolveProviderId(config, "off"), "kimi"); // unconfigured → default
  assert.equal(resolveProviderId(config, "bogus"), "kimi"); // unknown → default
});

test("streamChat shapes an OpenAI-compatible request for the chosen provider", async () => {
  let cap;
  const fetchImpl = async (url, init) => {
    cap = { url, init, body: JSON.parse(init.body) };
    return { ok: true, status: 200, body: sseStream([{ choices: [{ delta: { content: "hi" } }] }, "[DONE]"]) };
  };
  await collect(
    streamChat({
      config,
      providerId: "gemini",
      system: "You are Varun.",
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 256,
      fetchImpl,
    }),
  );
  assert.equal(cap.url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(cap.init.headers.Authorization, "Bearer gem-key");
  assert.equal(cap.body.model, "gemini-2.5-flash");
  assert.equal(cap.body.stream, true);
  assert.equal(cap.body.stream_options.include_usage, true);
  assert.equal(cap.body.max_tokens, 256);
  // system prompt is prepended as the first message
  assert.deepEqual(cap.body.messages[0], { role: "system", content: "You are Varun." });
  assert.deepEqual(cap.body.messages[1], { role: "user", content: "hello" });
});

test("streamChat yields text deltas in order and normalizes usage", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    body: sseStream([
      { choices: [{ delta: { content: "Hello" } }] },
      { choices: [{ delta: { content: " world" } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 } },
      "[DONE]",
    ]),
  });
  const events = await collect(
    streamChat({ config, providerId: "kimi", system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 100, fetchImpl }),
  );
  const text = events.filter((e) => e.text).map((e) => e.text).join("");
  const usage = events.find((e) => e.usage)?.usage;
  assert.equal(text, "Hello world");
  assert.deepEqual(usage, { input_tokens: 42, output_tokens: 8 });
});

test("streamChat surfaces a content-filter stop", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    body: sseStream([{ choices: [{ delta: {}, finish_reason: "content_filter" }] }, "[DONE]"]),
  });
  const events = await collect(
    streamChat({ config, providerId: "kimi", system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 100, fetchImpl }),
  );
  assert.ok(events.some((e) => e.filtered === true));
});

test("streamChat throws a labelled error on a non-OK response", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => "bad key" });
  await assert.rejects(
    () => collect(streamChat({ config, providerId: "kimi", system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 100, fetchImpl })),
    /Kimi K2 API error 401: bad key/,
  );
});

test("streamChat refuses an unconfigured provider", async () => {
  await assert.rejects(
    () => collect(streamChat({ config, providerId: "off", system: "s", messages: [], maxTokens: 100, fetchImpl: async () => ({ ok: true, body: sseStream([]) }) })),
    /not configured/,
  );
});
