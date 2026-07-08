# Digital Mind

**Digital Mind** is an AI assistant, trained on Varun's professional knowledge, that
visitors can talk to from anywhere on the site. Click the floating **"Ask Varun"**
button and ask about projects, robotics/ROS2 work, AI and embedded systems, research,
technical blogs, or the engineering decisions and trade‑offs behind them. Answers are
grounded in Varun's own notes and posts, stream in real time, render Markdown and code,
cite their sources, and suggest follow‑up questions.

This document explains how the feature is built, how it integrates with the existing
static site **without disrupting it**, how to configure and extend it, and the roadmap
for the milestones that follow.

---

## How it integrates without disrupting the site

The portfolio is a **static Astro site deployed on Vercel** (no server runtime). Digital
Mind adds capability in three small, reversible ways and touches nothing else:

1. **One React island** — `src/components/ui/DigitalMind.tsx` is rendered once in
   `src/layouts/Layout.astro` (the canonical wrapper), so the floating button appears
   site‑wide. It reuses the existing theme tokens (`--background`, `--foreground`,
   `--accent`, `--muted`, `--border`, `font-mono`), View Transitions, and the React
   island pattern already used elsewhere. No existing page markup changes.
2. **A same‑origin API** — `api/digital-mind/chat.ts` is a Vercel Serverless Function in
   a root `/api` directory. It deploys **alongside** the untouched static build (the
   Astro `dist/` output, `outputDirectory`, and the Pagefind step are unchanged).
   Because the endpoint is same‑origin (`/api/digital-mind/chat`), the site's strict
   Content‑Security‑Policy (`connect-src 'self'`) **already permits** it — no CSP change
   was required.
3. **A build‑time index step** — `npm run build` now runs `digital-mind:index` first to
   regenerate the knowledge index from the current content, then the normal
   `astro build && pagefind` pipeline. The step is additive and defensive.

Disable the whole feature at any time by setting `DIGITAL_MIND.enabled = false` in
`src/consts.ts`; the island renders nothing and the button disappears.

## Architecture (Milestone 1 — UX‑first)

```
Browser (static Astro page)                         Vercel Serverless Function
┌────────────────────────────┐                      ┌───────────────────────────────┐
│ DigitalMind.tsx island      │   POST (same‑origin) │ api/digital-mind/chat.ts       │
│  • floating "Ask Varun"     │  /api/digital-mind/  │  1. retrieve() public chunks   │
│  • full‑screen chat modal    │ ───────chat────────▶ │     (BM25 over the index)      │
│  • SSE reader → streamed      │                      │  2. buildSystemPrompt(context) │
│    Markdown + code            │ ◀──text/event-stream─│  3. stream Claude → SSE        │
│  • citation + follow‑up chips │   sources · tokens · │  4. sources + follow‑ups       │
│  • session history            │   followups · done   │                               │
└────────────────────────────┘                      └──────────────┬────────────────┘
                                                     ┌──────────────▼────────────────┐
                                                     │ _lib/knowledge-index.json      │
                                                     │ (built from blog + about)      │
                                                     └───────────────────────────────┘
```

The retrieval interface — `buildRetriever(chunks).retrieve(query, opts)` — is deliberately
the same shape a vector/hybrid backend will expose later, so upgrading retrieval (see
Roadmap) is a drop‑in change with no edits to the function or the UI.

### Request/response contract (SSE)

`POST /api/digital-mind/chat` with `{ "messages": [{ "role": "user"|"assistant", "content": string }] }`
responds with `text/event-stream`. Each frame is `data: <json>` where `<json>` is one of:

| `type`      | Payload                                   | Meaning                              |
| ----------- | ----------------------------------------- | ------------------------------------ |
| `sources`   | `{ sources: {title,url,snippet}[] }`      | Cited knowledge sources (sent first) |
| `token`     | `{ text: string }`                        | A streamed chunk of the answer       |
| `followups` | `{ followups: string[] }`                 | Suggested follow‑up questions        |
| `error`     | `{ message: string }`                     | A user‑facing error message          |
| `done`      | `{}`                                       | Stream complete                      |

## Files

| Path | Purpose |
| ---- | ------- |
| `src/components/ui/DigitalMind.tsx` | The chat island (button, modal, streaming, citations, follow‑ups, session history). |
| `src/components/ui/digital-mind.css` | Theme‑aware, self‑contained widget styles. |
| `src/consts.ts` → `DIGITAL_MIND` | Feature toggle, labels, example prompts, endpoint. |
| `src/layouts/Layout.astro` | Renders the island once, site‑wide. |
| `api/digital-mind/chat.ts` | Same‑origin serverless chat endpoint (SSE, streaming). |
| `api/digital-mind/_lib/chunk.mjs` | Markdown → plain‑text, heading‑aware chunking. |
| `api/digital-mind/_lib/retrieve.mjs` | Lexical BM25 retrieval with a `visibility` access filter. |
| `api/digital-mind/_lib/prompt.mjs` | System prompt, source, and follow‑up builders. |
| `api/digital-mind/_lib/config.mjs` | Env‑driven provider/model/limits config. |
| `api/digital-mind/_lib/knowledge-index.json` | Generated index (committed; rebuilt on every deploy). |
| `api/digital-mind/_lib/*.test.mjs` | `node --test` unit tests for the pure logic. |
| `scripts/build-knowledge-index.mjs` | Ingestion: blog + About → chunks → index. |

## Configuration

All secrets and provider settings live **server‑side** (Vercel environment variables) and
are never shipped to the browser.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `ANTHROPIC_API_KEY` | _(required)_ | Enables the assistant. Without it the UI shows a friendly "not connected" message. |
| `DIGITAL_MIND_MODEL` | `claude-opus-4-8` | LLM model id. |
| `DIGITAL_MIND_PROVIDER` | `anthropic` | Provider selector (modular; more providers land in a later milestone). |
| `DIGITAL_MIND_MAX_TOKENS` | `1024` | Max answer length. |
| `DIGITAL_MIND_TOP_K` | `5` | Number of chunks retrieved per query. |
| `DIGITAL_MIND_MAX_HISTORY` | `10` | Conversation turns sent to the model. |

Set `ANTHROPIC_API_KEY` in **Vercel → Project → Settings → Environment Variables**.

## Security & permissions

- **Only `visibility: "public"` chunks are ever retrievable** by the public endpoint. The
  ingestion script marks posts with `draft: true` as skipped and `unlisted: true` as
  non‑public, and the retriever filters on `visibility` — so unapproved knowledge never
  reaches visitors. This is the seed of the document‑permission model that the admin area
  will manage in a later milestone.
- **API keys stay server‑side.** The browser only ever talks to the same‑origin endpoint;
  the model provider and key never leave the function.
- **No CSP relaxation.** Same‑origin calls satisfy the existing `connect-src 'self'`.
- **Model output is rendered safely** — Markdown is rendered without raw HTML, and links
  open with `rel="noopener noreferrer nofollow"`.

## Updating the knowledge base

The index is rebuilt automatically on every deploy (it's the first step of `npm run build`).
To regenerate it locally after adding or editing content:

```bash
npm run digital-mind:index
```

Milestone 1 ingests the site's Markdown/MDX (`src/content/blog/**` and `src/pages/about.mdx`).
Additional source types (PDF, DOCX, image OCR, audio/video transcripts, GitHub, …) land in
the ingestion milestone and emit the same `Chunk` contract, so nothing downstream changes.

## Local development

```bash
npm run digital-mind:index   # (re)build the knowledge index
npm run build                # production build (per project policy; do not use dev in agents)
npm test                     # unit tests for chunking + retrieval
```

The chat endpoint is a Vercel Function, so it runs on Vercel (or `vercel dev`), not under
`astro preview`. The UI degrades gracefully when the endpoint is unavailable.

## Roadmap

Milestone 1 (this change) is intentionally the thin, UX‑first slice. It is structured so
the heavier platform fills in behind the same UI and contracts:

1. **UX‑first working chat** ✅ — floating button, themed streaming chat, lexical retrieval
   over existing content, citations, follow‑ups, session memory.
2. **Vector/hybrid retrieval** — Supabase Postgres + `pgvector` (or managed Qdrant):
   embeddings, hybrid (vector + keyword) search, metadata filtering, re‑ranking. Drops in
   behind `retrieve()`.
3. **Ingestion connectors** — PDF, DOCX, image OCR, audio/video transcripts, and pluggable
   source connectors (GitHub, YouTube, Drive, Notion, Obsidian) feeding the same index.
4. **Conversation memory + attribution** — server‑side chat persistence and richer,
   inline citations.
5. **Admin area** — authenticated upload, re‑index, delete, ingestion logs, usage
   monitoring, provider config, conversation review, and prompt management, with
   per‑document permissions.
6. **Future integrations** — voice interface, vision models, and knowledge graphs.
