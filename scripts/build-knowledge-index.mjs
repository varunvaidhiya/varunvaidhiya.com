// Build-time ingestion for the Digital Mind knowledge base.
//
// Milestone 1: index the site's own Markdown/MDX (blog posts + About page) into
// a single committed JSON index the chat function reads. This is the seed of the
// pipeline described in docs/digital-mind.md — later milestones add source
// connectors (PDF, DOCX, OCR, transcripts, GitHub, …) that emit the same Chunk
// contract into the same index, so nothing downstream changes.
//
// Usage: npm run digital-mind:index

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { chunkDocument } from "../api/digital-mind/_lib/chunk.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = path.join(ROOT, "src/content/blog");
const ABOUT_FILE = path.join(ROOT, "src/pages/about.mdx");
const OUT_FILE = path.join(ROOT, "api/digital-mind/_lib/knowledge-index.json");

/** Recursively collect .md/.mdx files, skipping `_`-prefixed drafts. */
async function collectMarkdown(dir) {
  /** @type {string[]} */
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of await readdir(dir)) {
    if (entry.startsWith("_")) continue;
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) files.push(...(await collectMarkdown(full)));
    else if (/\.mdx?$/.test(entry)) files.push(full);
  }
  return files;
}

function slugFromFile(file, data) {
  if (data.slug) return String(data.slug);
  return path.basename(file).replace(/\.mdx?$/, "");
}

async function main() {
  /** @type {import("../api/digital-mind/_lib/chunk.mjs").Chunk[]} */
  const chunks = [];
  let docCount = 0;
  let skipped = 0;

  // --- Blog posts -----------------------------------------------------------
  for (const file of await collectMarkdown(BLOG_DIR)) {
    try {
      const { data, content } = matter(await readFile(file, "utf8"));
      if (data.draft === true) {
        skipped++;
        continue;
      }
      const slug = slugFromFile(file, data);
      const visibility = data.unlisted === true ? "unlisted" : "public";
      const docChunks = chunkDocument({
        id: `blog/${slug}`,
        title: data.title ?? slug,
        url: `/posts/${slug}`,
        source: "blog",
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        visibility,
        body: content,
      });
      chunks.push(...docChunks);
      docCount++;
    } catch (err) {
      console.warn(`[digital-mind] skipped ${path.relative(ROOT, file)}: ${err.message}`);
      skipped++;
    }
  }

  // --- About page -----------------------------------------------------------
  if (existsSync(ABOUT_FILE)) {
    try {
      const { data, content } = matter(await readFile(ABOUT_FILE, "utf8"));
      chunks.push(
        ...chunkDocument({
          id: "page/about",
          title: data.title ? String(data.title) : "About Varun Vaidhiya",
          url: "/about",
          source: "page",
          tags: ["about", "bio"],
          visibility: "public",
          body: content,
        }),
      );
      docCount++;
    } catch (err) {
      console.warn(`[digital-mind] skipped about.mdx: ${err.message}`);
    }
  }

  const index = {
    generatedAt: new Date().toISOString(),
    docCount,
    chunkCount: chunks.length,
    chunks,
  };

  await writeFile(OUT_FILE, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(
    `[digital-mind] indexed ${docCount} document(s) into ${chunks.length} chunk(s)` +
      (skipped ? `, skipped ${skipped}` : "") +
      ` → ${path.relative(ROOT, OUT_FILE)}`,
  );
}

main().catch((err) => {
  console.error("[digital-mind] index build failed:", err);
  process.exit(1);
});
