import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, buildRetriever } from "./retrieve.mjs";

/** @type {import("./chunk.mjs").Chunk[]} */
const CHUNKS = [
  {
    id: "blog/robots#0",
    text: "I built a ROS2 mecanum wheel robot with motion planning and sensor fusion.",
    title: "Mecanum Robot",
    url: "/posts/mecanum-robot",
    source: "blog",
    tags: ["robotics", "ros2"],
    visibility: "public",
  },
  {
    id: "blog/arm#0",
    text: "AI inference on ARM hardware, benchmarking models with Perfetto traces.",
    title: "AI on Arm",
    url: "/posts/ai-on-arm",
    source: "blog",
    tags: ["ai", "arm", "performance"],
    visibility: "public",
  },
  {
    id: "private/salary#0",
    text: "Private robotics compensation notes that must never be served publicly.",
    title: "Private Notes",
    url: "/private/notes",
    source: "note",
    tags: ["robotics"],
    visibility: "private",
  },
];

test("tokenize lowercases, splits, and drops stopwords", () => {
  assert.deepEqual(tokenize("I built a ROS2 Robot"), ["built", "ros2", "robot"]);
});

test("retrieve ranks the most relevant chunk first", () => {
  const { retrieve } = buildRetriever(CHUNKS);
  const results = retrieve("ARM benchmarking performance");
  assert.ok(results.length >= 1);
  assert.equal(results[0].url, "/posts/ai-on-arm");
});

test("retrieve never returns non-public chunks", () => {
  const { retrieve } = buildRetriever(CHUNKS);
  const results = retrieve("robotics robot");
  assert.ok(results.length >= 1, "should still match the public robotics chunk");
  for (const r of results) {
    assert.equal(r.visibility, "public");
    assert.notEqual(r.url, "/private/notes");
  }
});

test("retrieve returns empty for an all-stopword or empty query", () => {
  const { retrieve } = buildRetriever(CHUNKS);
  assert.deepEqual(retrieve(""), []);
  assert.deepEqual(retrieve("the and of"), []);
});

test("retrieve respects topK", () => {
  const { retrieve } = buildRetriever(CHUNKS);
  const results = retrieve("robot arm ai robotics", { topK: 1 });
  assert.equal(results.length, 1);
});
