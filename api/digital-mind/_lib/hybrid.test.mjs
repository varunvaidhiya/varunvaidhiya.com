import { test } from "node:test";
import assert from "node:assert/strict";
import { reciprocalRankFusion } from "./hybrid.mjs";

const chunk = (id, extra = {}) => ({
  id,
  text: `text ${id}`,
  title: id,
  url: `/posts/${id}`,
  source: "blog",
  tags: [],
  visibility: "public",
  ...extra,
});

test("RRF ranks items appearing high in multiple lists first", () => {
  const lexical = [chunk("a"), chunk("b"), chunk("c")];
  const vector = [chunk("b"), chunk("d"), chunk("a")];
  const fused = reciprocalRankFusion([lexical, vector], { topK: 4 });
  // 'b' is rank0 in vector + rank1 in lexical; 'a' is rank0 lexical + rank2 vector.
  assert.equal(fused[0].id, "b");
  assert.ok(fused.some((c) => c.id === "a"));
});

test("RRF de-duplicates across lists", () => {
  const l1 = [chunk("a"), chunk("b")];
  const l2 = [chunk("a"), chunk("b")];
  const fused = reciprocalRankFusion([l1, l2], { topK: 10 });
  assert.equal(fused.length, 2);
  assert.deepEqual(fused.map((c) => c.id).sort(), ["a", "b"]);
});

test("RRF respects topK and attaches a fused score", () => {
  const list = [chunk("a"), chunk("b"), chunk("c"), chunk("d")];
  const fused = reciprocalRankFusion([list], { topK: 2 });
  assert.equal(fused.length, 2);
  assert.ok(typeof fused[0].score === "number" && fused[0].score > 0);
});

test("RRF tolerates empty / missing lists", () => {
  const fused = reciprocalRankFusion([[], [chunk("a")], null], { topK: 5 });
  assert.equal(fused.length, 1);
  assert.equal(fused[0].id, "a");
});

test("RRF supports a custom key (fuse by url)", () => {
  const a1 = chunk("x", { url: "/same" });
  const a2 = chunk("y", { url: "/same" });
  const fused = reciprocalRankFusion([[a1], [a2]], { topK: 5, keyOf: (c) => c.url });
  assert.equal(fused.length, 1);
});
