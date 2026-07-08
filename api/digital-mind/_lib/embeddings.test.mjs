import { test } from "node:test";
import assert from "node:assert/strict";
import { getEmbeddingsProvider, SUPPORTED_EMBEDDINGS_PROVIDERS } from "./embeddings.mjs";

const vec = (n) => Array.from({ length: n }, (_, i) => i / n);

function fakeFetch(dims, capture) {
  return async (url, init) => {
    capture.url = url;
    capture.body = JSON.parse(init.body);
    capture.auth = init.headers.Authorization;
    return {
      ok: true,
      json: async () => ({ data: capture.body.input.map(() => ({ embedding: vec(dims) })) }),
    };
  };
}

test("supports openai and voyage", () => {
  assert.deepEqual(SUPPORTED_EMBEDDINGS_PROVIDERS.sort(), ["openai", "voyage"]);
});

test("openai provider shapes the request and returns vectors", async () => {
  const cap = {};
  const provider = getEmbeddingsProvider(
    { embeddingsProvider: "openai", embeddingsDimensions: 8 },
    { fetchImpl: fakeFetch(8, cap), apiKey: "sk-test" },
  );
  const out = await provider.embed(["hello", "world"]);
  assert.equal(out.length, 2);
  assert.equal(out[0].length, 8);
  assert.match(cap.url, /openai\.com/);
  assert.equal(cap.body.model, "text-embedding-3-small");
  assert.equal(cap.auth, "Bearer sk-test");
});

test("voyage provider hits the voyage endpoint with its default model", async () => {
  const cap = {};
  const provider = getEmbeddingsProvider(
    { embeddingsProvider: "voyage", embeddingsDimensions: 4 },
    { fetchImpl: fakeFetch(4, cap), apiKey: "pa-test" },
  );
  await provider.embed(["x"]);
  assert.match(cap.url, /voyageai\.com/);
  assert.equal(cap.body.model, "voyage-3");
});

test("throws on a dimension mismatch", async () => {
  const provider = getEmbeddingsProvider(
    { embeddingsProvider: "openai", embeddingsDimensions: 1536 },
    { fetchImpl: fakeFetch(8, {}), apiKey: "sk-test" },
  );
  await assert.rejects(() => provider.embed(["x"]), /dimension mismatch/i);
});

test("throws when the API key is missing", async () => {
  const provider = getEmbeddingsProvider(
    { embeddingsProvider: "openai", embeddingsDimensions: 8 },
    { fetchImpl: fakeFetch(8, {}), apiKey: "" },
  );
  await assert.rejects(() => provider.embed(["x"]), /OPENAI_API_KEY/);
});

test("throws on an unknown provider", () => {
  assert.throws(
    () => getEmbeddingsProvider({ embeddingsProvider: "nope", embeddingsDimensions: 8 }),
    /Unknown embeddings provider/,
  );
});

test("empty input returns no vectors without calling fetch", async () => {
  let called = false;
  const provider = getEmbeddingsProvider(
    { embeddingsProvider: "openai", embeddingsDimensions: 8 },
    {
      fetchImpl: async () => {
        called = true;
        return { ok: true, json: async () => ({ data: [] }) };
      },
      apiKey: "sk-test",
    },
  );
  assert.deepEqual(await provider.embed([]), []);
  assert.equal(called, false);
});
