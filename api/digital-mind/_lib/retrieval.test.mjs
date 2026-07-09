import { test } from "node:test";
import assert from "node:assert/strict";
import { createRetriever } from "./retrieval.mjs";

// The dispatcher's embeddings/rerank providers read their keys from the env; set
// dummies so the hybrid + rerank paths run (all network is stubbed via fetchImpl).
process.env.OPENAI_API_KEY = "sk-test";
process.env.VOYAGE_API_KEY = "pa-test";

const CHUNKS = [
  {
    id: "l1",
    text: "robotics ros2 mecanum wheel motion planning",
    title: "Robots",
    url: "/posts/robots",
    source: "blog",
    tags: ["robotics"],
    visibility: "public",
  },
  {
    id: "l2",
    text: "arm inference benchmarking perfetto",
    title: "Arm",
    url: "/posts/arm",
    source: "blog",
    tags: ["ai"],
    visibility: "public",
  },
];

const lexicalConfig = { topK: 5, hybridEnabled: false };

const hybridConfig = {
  topK: 5,
  hybridEnabled: true,
  embeddingsProvider: "openai",
  embeddingsDimensions: 4,
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "service-key",
};

// Routes embeddings + Supabase RPC calls to canned responses.
function router({ failEmbeddings = false } = {}) {
  return async (url) => {
    if (/openai|voyage/.test(url)) {
      if (failEmbeddings) return { ok: false, status: 500, text: async () => "boom" };
      return { ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }] }) };
    }
    if (/rpc\/match_dm_chunks/.test(url)) {
      return {
        ok: true,
        json: async () => [
          {
            id: "l2",
            text: CHUNKS[1].text,
            title: "Arm",
            url: "/posts/arm",
            source: "blog",
            heading: null,
            tags: ["ai"],
            visibility: "public",
            similarity: 0.92,
          },
        ],
      };
    }
    throw new Error(`unexpected url ${url}`);
  };
}

test("lexical mode returns BM25 results (async), no network", async () => {
  let fetched = false;
  const retriever = createRetriever(lexicalConfig, {
    chunks: CHUNKS,
    fetchImpl: async () => {
      fetched = true;
      return { ok: true, json: async () => ({}) };
    },
  });
  assert.equal(retriever.mode, "lexical");
  const out = await retriever.retrieve("robotics ros2");
  assert.equal(out[0].url, "/posts/robots");
  assert.equal(fetched, false);
});

test("hybrid mode fuses lexical + vector results", async () => {
  const retriever = createRetriever(hybridConfig, { chunks: CHUNKS, fetchImpl: router() });
  assert.equal(retriever.mode, "hybrid");
  const out = await retriever.retrieve("robotics");
  const urls = out.map((c) => c.url);
  assert.ok(urls.includes("/posts/robots"), "keeps the lexical match");
  assert.ok(urls.includes("/posts/arm"), "adds the vector-only match");
});

test("hybrid falls back to lexical when the vector path fails", async () => {
  const retriever = createRetriever(hybridConfig, {
    chunks: CHUNKS,
    fetchImpl: router({ failEmbeddings: true }),
    logger: () => {}, // silence expected warning
  });
  const out = await retriever.retrieve("robotics ros2");
  assert.ok(out.length >= 1);
  assert.equal(out[0].url, "/posts/robots");
});

const rerankConfig = {
  topK: 2,
  hybridEnabled: false,
  rerankEnabled: true,
  rerankProvider: "voyage",
  rerankCandidates: 8,
};

test("rerank mode reorders the candidate pool", async () => {
  const fetchImpl = async (url, init) => {
    if (/voyageai\.com\/v1\/rerank/.test(url)) {
      const body = JSON.parse(init.body);
      // Rank the second candidate first regardless of first-pass order.
      return {
        ok: true,
        json: async () => ({
          data: body.documents.map((_, i) => ({ index: i, relevance_score: i === 1 ? 0.9 : 0.2 })),
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };
  const retriever = createRetriever(rerankConfig, { chunks: CHUNKS, fetchImpl });
  assert.equal(retriever.mode, "lexical+rerank");
  const out = await retriever.retrieve("robotics arm");
  assert.equal(out.length, 2);
  // Whichever candidate landed at index 1 is now ranked first.
  assert.ok(out[0].score === 0.9);
});

test("rerank falls back to first-pass order on failure", async () => {
  const retriever = createRetriever(rerankConfig, {
    chunks: CHUNKS,
    fetchImpl: async () => ({ ok: false, status: 500, text: async () => "boom" }),
    logger: () => {},
  });
  const out = await retriever.retrieve("robotics arm");
  assert.ok(out.length >= 1, "still returns first-pass candidates");
});
