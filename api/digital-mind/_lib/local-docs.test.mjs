import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectLocalDocs } from "./local-docs.mjs";

const injected = {
  extractPdf: async () => "Extracted PDF body about ROS2 navigation.",
  extractDocx: async () => "Extracted DOCX body about embedded systems.",
  logger: () => {},
};

async function withDir(files, fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dm-docs-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(dir, name), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("ingests markdown with frontmatter, txt, pdf, and docx", async () => {
  await withDir(
    {
      "note.md": "---\ntitle: My Note\ntags: [ai, notes]\nurl: https://example.com/n\n---\n\n# My Note\n\nContent about AI benchmarking.",
      "plain.txt": "Plain text notes about performance profiling.",
      "paper.pdf": "%PDF-fake-bytes",
      "spec.docx": "PK-fake-docx-bytes",
    },
    async (dir) => {
      const chunks = await collectLocalDocs(dir, injected);
      const byId = (p) => chunks.filter((c) => c.id.startsWith(p));
      assert.ok(byId("doc/note").length >= 1, "markdown ingested");
      assert.ok(byId("doc/plain").length >= 1, "txt ingested");
      assert.ok(byId("doc/paper").length >= 1, "pdf ingested via injected extractor");
      assert.ok(byId("doc/spec").length >= 1, "docx ingested via injected extractor");

      const note = byId("doc/note")[0];
      assert.equal(note.title, "My Note");
      assert.equal(note.url, "https://example.com/n");
      assert.equal(note.source, "doc");
      assert.deepEqual(note.tags, ["ai", "notes"]);
      assert.ok(byId("doc/paper")[0].text.includes("ROS2"));
    },
  );
});

test("skips non-public docs, README, and _-prefixed files", async () => {
  await withDir(
    {
      "public.md": "# Public\n\nvisible knowledge.",
      "secret.md": "---\nvisibility: private\n---\n\n# Secret\n\ndo not expose.",
      "README.md": "# Folder readme\n\ninstructions, not knowledge.",
      "_draft.md": "# Draft\n\nunfinished.",
    },
    async (dir) => {
      const chunks = await collectLocalDocs(dir, injected);
      const ids = chunks.map((c) => c.id);
      assert.ok(ids.some((id) => id.startsWith("doc/public")));
      assert.ok(!ids.some((id) => id.startsWith("doc/secret")), "private doc excluded");
      assert.ok(!chunks.some((c) => /instructions, not knowledge/.test(c.text)), "README excluded");
      assert.ok(!ids.some((id) => id.startsWith("doc/-draft") || /draft/.test(id)), "_draft excluded");
    },
  );
});

test("local docs default to public visibility and empty url", async () => {
  await withDir({ "a.txt": "some content" }, async (dir) => {
    const [chunk] = await collectLocalDocs(dir, injected);
    assert.equal(chunk.visibility, "public");
    assert.equal(chunk.url, "");
  });
});

test("missing directory returns no chunks", async () => {
  const chunks = await collectLocalDocs("/nonexistent/dir/xyz", injected);
  assert.deepEqual(chunks, []);
});
