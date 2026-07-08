import { test } from "node:test";
import assert from "node:assert/strict";
import { mdToPlain, chunkBody, chunkDocument } from "./chunk.mjs";

test("mdToPlain strips markdown syntax but keeps link text and words", () => {
  const md = "# Title\n\nI built [runanywhere](https://github.com/x) with `Kotlin` and **ROS2**.";
  const plain = mdToPlain(md);
  assert.match(plain, /I built runanywhere with Kotlin and ROS2\./);
  assert.doesNotMatch(plain, /github\.com/);
  assert.doesNotMatch(plain, /[#*`]/);
});

test("mdToPlain drops MDX import/JSX and images", () => {
  const md = "import Foo from '../Foo';\n\n<Foo bar />\n\n![alt text](/img.png) done";
  const plain = mdToPlain(md);
  assert.doesNotMatch(plain, /import|<Foo/);
  assert.match(plain, /alt text done/);
});

test("chunkBody tracks the nearest preceding heading", () => {
  const body = "# Intro\n\nHello world.\n\n## Robotics\n\nMecanum wheels are fun.";
  const chunks = chunkBody(body, { maxChars: 20 });
  const robotics = chunks.find((c) => /Mecanum/.test(c.text));
  assert.ok(robotics, "expected a chunk containing the robotics paragraph");
  assert.equal(robotics.heading, "Robotics");
});

test("chunkBody splits when a section exceeds maxChars", () => {
  const para = "word ".repeat(60).trim(); // ~300 chars
  const body = `${para}\n\n${para}\n\n${para}`;
  const chunks = chunkBody(body, { maxChars: 400 });
  assert.ok(chunks.length >= 2, "long body should split into multiple chunks");
  for (const c of chunks) assert.ok(c.text.length <= 700);
});

test("chunkDocument produces stable ids and carries metadata", () => {
  const chunks = chunkDocument({
    id: "blog/my-projects",
    title: "My Open Source Projects",
    url: "/posts/my-projects",
    source: "blog",
    tags: ["projects", "ai"],
    visibility: "public",
    body: "## AI-on-Arm\n\nAI inference on ARM hardware.\n\n## SAM2forAV\n\nSegmentation for AVs.",
  });
  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].id, "blog/my-projects#0");
  assert.equal(chunks[0].url, "/posts/my-projects");
  assert.deepEqual(chunks[0].tags, ["projects", "ai"]);
  assert.equal(chunks[0].visibility, "public");
});

test("chunkDocument defaults visibility to public", () => {
  const [chunk] = chunkDocument({
    id: "page/about",
    title: "About",
    url: "/about",
    source: "page",
    body: "Hello.",
  });
  assert.equal(chunk.visibility, "public");
});
