// Framework-free content chunking for the Digital Mind knowledge index.
//
// This module is deliberately dependency-free so it can be unit-tested with
// `node --test` and imported both by the build-time ingestion script and (in
// later milestones) by any runtime that needs to re-chunk content on the fly.
//
// Milestone 1 ingests Markdown/MDX only. The `Chunk` contract below is the
// stable interface every future source connector (PDF, DOCX, OCR, transcripts)
// must produce, so the retrieval + generation layers never change.

/**
 * @typedef {Object} Chunk
 * @property {string} id          Stable unique id, e.g. "blog/my-projects#2".
 * @property {string} text        Cleaned, plain-text chunk body.
 * @property {string} title       Human title of the source document.
 * @property {string} url         Site-relative URL of the source, e.g. "/posts/my-projects".
 * @property {string} source      Source kind: "blog" | "page" | ...
 * @property {string} [heading]   Nearest preceding Markdown heading, if any.
 * @property {string[]} tags       Topical tags for metadata filtering.
 * @property {"public"|"unlisted"|"private"} visibility  Access level; only "public" is ever served to visitors.
 */

const DEFAULT_MAX_CHARS = 900;

/**
 * Lightly convert Markdown/MDX to plain text for lexical indexing.
 * We keep the words (including link text and inline code) and drop syntax,
 * URLs, images, and JSX/HTML so retrieval scores on meaning, not markup.
 * @param {string} md
 * @returns {string}
 */
export function mdToPlain(md) {
  return (
    md
      // fenced code blocks -> keep inner code text, drop the fences
      .replace(/```[a-zA-Z0-9]*\n?/g, "")
      .replace(/```/g, "")
      // images ![alt](url) -> alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // MDX import/export statements -> drop the whole line
      .replace(/^\s*(?:import|export)\s[^\n]*$/gm, "")
      // MDX/HTML tags -> space
      .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
      // heading markers, blockquotes, list bullets, emphasis, inline code ticks
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/[*_`]/g, "")
      // table pipes and separators
      .replace(/\|/g, " ")
      .replace(/^\s*[:-]+\s*$/gm, "")
      // collapse whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Split a Markdown body into heading-aware, size-bounded chunks.
 * Blocks (paragraphs) are greedily packed up to `maxChars`; each chunk records
 * the nearest preceding heading so citations and prompts can stay contextual.
 * @param {string} body  Raw Markdown/MDX body (frontmatter already removed).
 * @param {{ maxChars?: number }} [opts]
 * @returns {{ text: string, heading?: string }[]}
 */
export function chunkBody(body, opts = {}) {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  /** @type {{ heading?: string, raw: string }[]} */
  const blocks = [];
  let currentHeading;
  let buffer = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const raw = buffer.join("\n").trim();
    if (raw) blocks.push({ heading: currentHeading, raw });
    buffer = [];
  };

  for (const line of lines) {
    // Skip MDX import/export lines entirely.
    if (/^\s*(import|export)\s/.test(line)) continue;

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[2].trim();
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();

  /** @type {{ text: string, heading?: string }[]} */
  const chunks = [];
  let acc = "";
  let accHeading;

  const commit = () => {
    const text = mdToPlain(acc).trim();
    if (text) chunks.push({ text, heading: accHeading });
    acc = "";
  };

  for (const block of blocks) {
    if (acc === "") accHeading = block.heading;
    const candidate = acc ? `${acc}\n\n${block.raw}` : block.raw;
    if (candidate.length > maxChars && acc) {
      commit();
      acc = block.raw;
      accHeading = block.heading;
    } else {
      acc = candidate;
    }
  }
  commit();

  return chunks;
}

/**
 * Turn a parsed document into indexable chunks.
 * @param {{ id: string, title: string, url: string, source: string, tags?: string[], visibility?: Chunk["visibility"], body: string }} doc
 * @param {{ maxChars?: number }} [opts]
 * @returns {Chunk[]}
 */
export function chunkDocument(doc, opts = {}) {
  const pieces = chunkBody(doc.body, opts);
  return pieces.map((piece, i) => ({
    id: `${doc.id}#${i}`,
    text: piece.text,
    title: doc.title,
    url: doc.url,
    source: doc.source,
    heading: piece.heading,
    tags: doc.tags ?? [],
    visibility: doc.visibility ?? "public",
  }));
}
