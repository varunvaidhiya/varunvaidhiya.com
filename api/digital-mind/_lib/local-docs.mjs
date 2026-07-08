// Local documents connector (Milestone 3).
//
// Indexes a drop-in folder (default: content/knowledge/) of Markdown, plain
// text, PDF, and DOCX files into the same Chunk contract as the rest of the
// pipeline. PDF/DOCX text extraction is done with unpdf / mammoth, lazily
// imported (and injectable, so the connector is unit-testable without real
// binary fixtures).
//
// Only PUBLIC docs are indexed. A file with `visibility` frontmatter other than
// "public" is skipped here — private/permissioned documents belong to the admin
// area (Milestone 5) with proper private storage, so they never land in the
// committed public index.

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { chunkDocument } from "./chunk.mjs";

async function defaultExtractPdf(buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

async function defaultExtractDocx(buffer) {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

function titleFromFilename(file) {
  return path
    .basename(file)
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function slugFromPath(dir, file) {
  return path
    .relative(dir, file)
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .toLowerCase();
}

async function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of await readdir(dir)) {
    if (entry.startsWith("_") || entry === "README.md") continue;
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

/**
 * @param {string} dir  Absolute path to the knowledge folder.
 * @param {{ extractPdf?: (b: Buffer) => Promise<string>, extractDocx?: (b: Buffer) => Promise<string>, logger?: (msg: string) => void }} [deps]
 * @returns {Promise<import("./chunk.mjs").Chunk[]>}
 */
export async function collectLocalDocs(dir, deps = {}) {
  if (!existsSync(dir)) return [];
  const extractPdf = deps.extractPdf ?? defaultExtractPdf;
  const extractDocx = deps.extractDocx ?? defaultExtractDocx;
  const log = deps.logger ?? ((m) => console.warn(`[digital-mind] ${m}`));

  /** @type {import("./chunk.mjs").Chunk[]} */
  const chunks = [];

  for (const file of await walk(dir)) {
    const ext = path.extname(file).toLowerCase();
    const rel = path.relative(dir, file);
    try {
      let title = titleFromFilename(file);
      let url = "";
      let tags = [];
      let visibility = "public";
      let body = "";

      if (ext === ".md" || ext === ".mdx" || ext === ".markdown") {
        const { data, content } = matter(await readFile(file, "utf8"));
        if (data.visibility && data.visibility !== "public") {
          log(`skipped non-public doc ${rel} (visibility: ${data.visibility})`);
          continue;
        }
        title = data.title ? String(data.title) : title;
        url = data.url ? String(data.url) : data.source ? String(data.source) : "";
        tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
        body = content;
      } else if (ext === ".txt") {
        body = await readFile(file, "utf8");
      } else if (ext === ".pdf") {
        body = await extractPdf(await readFile(file));
      } else if (ext === ".docx") {
        body = await extractDocx(await readFile(file));
      } else {
        continue; // unsupported type
      }

      if (!body || !body.trim()) {
        log(`skipped empty doc ${rel}`);
        continue;
      }

      chunks.push(
        ...chunkDocument({
          id: `doc/${slugFromPath(dir, file)}`,
          title,
          url,
          source: "doc",
          tags,
          visibility,
          body,
        }),
      );
    } catch (err) {
      log(`failed to ingest ${rel}: ${err.message ?? err}`);
    }
  }

  return chunks;
}
