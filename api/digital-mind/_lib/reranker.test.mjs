import { test } from "node:test";
import assert from "node:assert/strict";
import { getReranker, SUPPORTED_RERANK_PROVIDERS } from "./reranker.mjs";

const docs = [
  { id: "a", text: "alpha", url: "/a", title: "A", source: "blog", tags: [], visibility: "public" },
  { id: "b", text: "bravo", url: "/b", title: "B", source: "blog", tags: [], visibility: "public" },
  { id: "c", text: "charlie", url: "/c", title: "C", source: "blog", tags: [], visibility: "public" },
];

test("supports voyage and cohere", () => {
  assert.deepEqual(SUPPORTED_RERANK_PROVIDERS.sort(), ["cohere", "voyage"]);
});

test("voyage reranker reorders candidates by relevance and applies topK", async () => {
  const cap = {};
  const fetchImpl = async (url, init) => {
    cap.url = url;
    cap.body = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        data: [
          { index: 2, relevance_score: 0.9 },
          { index: 0, relevance_score: 0.7 },
          { index: 1, relevance_score: 0.1 },
        ],
      }),
    };
  };
  const rr = getReranker(
    { rerankProvider: "voyage", topK: 5 },
    { fetchImpl, apiKey: "pa-test" },
  );
  const out = await rr.rerank("q", docs, { topK: 2 });
  assert.match(cap.url, /voyageai\.com/);
  assert.equal(cap.body.model, "rerank-2");
  assert.equal(cap.body.top_k, 2);
  assert.deepEqual(out.map((d) => d.id), ["c", "a"]);
  assert.equal(out[0].score, 0.9);
});

test("cohere reranker uses top_n and results shape", async () => {
  const cap = {};
  const fetchImpl = async (url, init) => {
    cap.url = url;
    cap.body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ results: [{ index: 1, relevance_score: 0.5 }] }) };
  };
  const rr = getReranker(
    { rerankProvider: "cohere", topK: 5 },
    { fetchImpl, apiKey: "co-test" },
  );
  const out = await rr.rerank("q", docs, { topK: 3 });
  assert.match(cap.url, /cohere\.com/);
  assert.equal(cap.body.top_n, 3);
  assert.equal(cap.body.model, "rerank-english-v3.0");
  assert.deepEqual(out.map((d) => d.id), ["b"]);
});

test("throws without an API key; empty docs return []", async () => {
  const rr = getReranker({ rerankProvider: "voyage", topK: 5 }, { fetchImpl: async () => ({}), apiKey: "" });
  assert.deepEqual(await rr.rerank("q", []), []);
  await assert.rejects(() => rr.rerank("q", docs), /VOYAGE_API_KEY/);
});

test("throws on unknown provider", () => {
  assert.throws(() => getReranker({ rerankProvider: "nope" }), /Unknown rerank provider/);
});
