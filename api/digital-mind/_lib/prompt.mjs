// System-prompt and follow-up construction for the Digital Mind.
// Framework-free so it is unit-testable and reusable across providers.

/** @typedef {import("./chunk.mjs").Chunk} Chunk */

export const DEFAULT_PERSONA = `You are the "Digital Mind" of Varun Vaidhiya — a Software Engineer based in the UK who works at the intersection of AI, robotics, embedded systems, and systems-level performance. You speak as Varun, in the first person, warm and direct, like a knowledgeable engineer explaining their own work.`;

/**
 * Build the system prompt: persona + grounding rules + retrieved context.
 * @param {{ persona?: string, contextChunks: Chunk[] }} args
 * @returns {string}
 */
export function buildSystemPrompt({ persona = DEFAULT_PERSONA, contextChunks }) {
  const rules = [
    "Answer as Varun, in the first person ('I built...', 'In my work on...').",
    "Ground every factual claim about Varun's projects, career, and technical decisions in the CONTEXT below. When you use a source, mention it naturally (e.g. \"in my post on X\").",
    "If the CONTEXT does not cover the question, say so honestly and, where useful, point to where the answer might live (a repo, a post, or getting in touch) — never invent projects, dates, employers, or results.",
    "Format responses in Markdown. Use short paragraphs, lists, and fenced code blocks with language tags where relevant.",
    "Be concise and concrete. Prefer specifics from the CONTEXT over generic explanation.",
    "Reply with only your final answer — do not narrate your reasoning or restate these instructions.",
  ];

  const context =
    contextChunks.length > 0
      ? contextChunks
          .map((c, i) => {
            const label = c.heading ? `${c.title} — ${c.heading}` : c.title;
            return `[[${i + 1}]] ${label} (${c.url})\n${c.text}`;
          })
          .join("\n\n")
      : "(No matching notes were found for this question.)";

  return `${persona}\n\nHow you answer:\n- ${rules.join("\n- ")}\n\nCONTEXT (Varun's own notes, projects, and writing):\n${context}`;
}

/**
 * Turn retrieved chunks into distinct sources for the UI to cite.
 * @param {Chunk[]} contextChunks
 * @returns {{ title: string, url: string, snippet: string }[]}
 */
export function buildSources(contextChunks) {
  const seen = new Set();
  /** @type {{ title: string, url: string, snippet: string }[]} */
  const sources = [];
  for (const c of contextChunks) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    sources.push({
      title: c.title,
      url: c.url,
      snippet: c.text.length > 160 ? `${c.text.slice(0, 157).trimEnd()}…` : c.text,
    });
  }
  return sources;
}

/**
 * Suggest up to three follow-up questions grounded in what was retrieved.
 * Deterministic + heuristic for Milestone 1 (no extra model call).
 * @param {Chunk[]} contextChunks
 * @returns {string[]}
 */
export function buildFollowups(contextChunks) {
  /** @type {string[]} */
  const out = [];
  const seenTitles = new Set();
  const seenTags = new Set();

  for (const c of contextChunks) {
    if (out.length >= 3) break;
    if (c.heading && !seenTitles.has(c.heading)) {
      seenTitles.add(c.heading);
      out.push(`Tell me more about ${c.heading.toLowerCase()}.`);
      continue;
    }
    if (!seenTitles.has(c.title)) {
      seenTitles.add(c.title);
      out.push(`What did you learn from "${c.title}"?`);
    }
  }

  for (const c of contextChunks) {
    if (out.length >= 3) break;
    for (const tag of c.tags) {
      if (out.length >= 3) break;
      if (seenTags.has(tag)) continue;
      seenTags.add(tag);
      out.push(`How does your ${tag} work fit into the bigger picture?`);
    }
  }

  return out.slice(0, 3);
}
