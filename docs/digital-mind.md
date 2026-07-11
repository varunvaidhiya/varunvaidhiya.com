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
│    Markdown + code            │ ◀──text/event-stream─│  3. stream provider → SSE     │
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
| `src/components/ui/DigitalMind.tsx` | The chat island (button, modal, streaming, citations, follow‑ups, session history, model switcher). |
| `src/components/ui/digital-mind.css` | Theme‑aware, self‑contained widget styles. |
| `src/consts.ts` → `DIGITAL_MIND` | Feature toggle, labels, example prompts, endpoints. |
| `src/layouts/Layout.astro` | Renders the island once, site‑wide. |
| `api/digital-mind/chat.ts` | Same‑origin serverless chat endpoint (SSE, streaming); routes to the chosen provider. |
| `api/digital-mind/providers.ts` | Lists the configured LLM providers (Kimi K2 / Gemini) for the switcher. |
| `api/digital-mind/_lib/llm.mjs` | OpenAI‑compatible streaming client serving both Kimi K2 and Gemini. |
| `api/digital-mind/_lib/chunk.mjs` | Markdown → plain‑text, heading‑aware chunking. |
| `api/digital-mind/_lib/retrieve.mjs` | Lexical BM25 retrieval with a `visibility` access filter. |
| `api/digital-mind/_lib/retrieval.mjs` | Retrieval dispatcher: lexical, or fused lexical+vector (hybrid). |
| `api/digital-mind/_lib/embeddings.mjs` | Provider‑agnostic embeddings (Voyage / OpenAI). |
| `api/digital-mind/_lib/vector-store.mjs` | Supabase pgvector search + upsert client. |
| `api/digital-mind/_lib/hybrid.mjs` | Reciprocal Rank Fusion of lexical + vector results. |
| `api/digital-mind/_lib/reranker.mjs` | Hosted cross‑encoder re‑ranking (Voyage / Cohere) over the retrieved set. |
| `api/digital-mind/_lib/prompt.mjs` | System prompt, source, and follow‑up builders. |
| `api/digital-mind/_lib/config.mjs` | Env‑driven provider/model/retrieval config. |
| `api/digital-mind/_lib/local-docs.mjs` | Connector: `content/knowledge/` Markdown/txt/PDF/DOCX. |
| `api/digital-mind/_lib/github.mjs` | Connector: public GitHub repos (READMEs + metadata). |
| `api/digital-mind/_lib/memory.mjs` | Server‑side conversation persistence, usage logging, and admin settings. |
| `api/digital-mind/_lib/admin.mjs` | Admin auth + dispatch, usage aggregation, document upload/list/delete. |
| `api/digital-mind/admin.ts` | Token‑gated admin endpoint (GET/POST, same‑origin). |
| `src/pages/admin.astro` | The `noindex` admin page that mounts the dashboard. |
| `src/components/ui/AdminPanel.tsx` | Admin dashboard island: overview, conversations, documents, prompt. |
| `src/components/ui/admin.css` | Theme‑aware admin dashboard styles. |
| `api/digital-mind/_lib/knowledge-index.json` | Generated index (committed; rebuilt on every deploy). |
| `api/digital-mind/_lib/*.test.mjs` | `node --test` unit tests for the pure logic. |
| `scripts/build-knowledge-index.mjs` | Ingestion pipeline: runs all source connectors → index. |
| `scripts/embed-knowledge.mjs` | Opt‑in: embed the index into Supabase pgvector. |
| `content/knowledge/` | Drop‑in folder for documents to index (see its README). |
| `supabase/migrations/*.sql` | pgvector table + `match_dm_chunks`, memory tables, admin tables. |

## Configuration

All secrets and provider settings live **server‑side** (Vercel environment variables) and
are never shipped to the browser. The chat runs on a user‑selectable LLM provider — **Kimi
K2** (Moonshot) and **Gemini** — each enabled by its own key. Set at least one; set both to
give visitors the in‑chat model switcher. The browser only ever sends a provider *id*.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `MOONSHOT_API_KEY` | _(one key required)_ | Enables **Kimi K2**. Without any provider key the UI shows a friendly "not connected" message. |
| `GEMINI_API_KEY` | _(one key required)_ | Enables **Gemini**. |
| `DIGITAL_MIND_PROVIDER` | first configured | Default provider id (`kimi` or `gemini`) when the visitor hasn't picked one. Preference order is Kimi → Gemini. |
| `DIGITAL_MIND_KIMI_MODEL` | `kimi-k2.6` | Kimi model id. Moonshot retires ids often — override here if it 404s. |
| `DIGITAL_MIND_GEMINI_MODEL` | `gemini-flash-latest` | Gemini model id. The `-latest` alias auto-updates; pin a dated id here if you prefer. |
| `DIGITAL_MIND_KIMI_BASE_URL` | `https://api.moonshot.ai/v1` | Moonshot API base (e.g. use `…moonshot.cn/v1` for the China endpoint). |
| `DIGITAL_MIND_GEMINI_BASE_URL` | `…/v1beta/openai` | Gemini OpenAI‑compatible API base. |
| `DIGITAL_MIND_MAX_TOKENS` | `1024` | Max answer length. |
| `DIGITAL_MIND_TOP_K` | `5` | Number of chunks retrieved per query. |
| `DIGITAL_MIND_MAX_HISTORY` | `10` | Conversation turns sent to the model. |

Both providers are reached through a single **OpenAI‑compatible** streaming client
(`_lib/llm.mjs`), so adding another OpenAI‑compatible provider is just one more entry in the
registry (`_lib/config.mjs` → `PROVIDER_DEFS`).

**Milestone 2 — hybrid retrieval (optional, off by default):**

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DIGITAL_MIND_RETRIEVAL` | `lexical` | Set to `hybrid` to enable vector + keyword fusion. |
| `DIGITAL_MIND_EMBEDDINGS_PROVIDER` | `openai` | `openai` or `voyage`. |
| `DIGITAL_MIND_EMBEDDINGS_MODEL` | provider default | e.g. `text-embedding-3-small`, `voyage-3`. |
| `DIGITAL_MIND_EMBEDDINGS_DIM` | `1536` | Must match the model and the pgvector column. |
| `OPENAI_API_KEY` / `VOYAGE_API_KEY` | _(one required for hybrid)_ | Embeddings key for the chosen provider. |
| `SUPABASE_URL` | _(required for hybrid)_ | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | _(required for hybrid)_ | Server‑side key for pgvector access. |

**Milestone 3 — GitHub connector (optional, off by default):**

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DIGITAL_MIND_GITHUB_REPOS` | _(unset)_ | Comma list of `owner/repo` to index. |
| `DIGITAL_MIND_GITHUB_USER` | _(unset)_ | Or index all public repos of this user. |
| `GITHUB_TOKEN` | _(optional)_ | Raises API rate limits; enables private repos. |

**Milestone 4 — re‑ranking (optional, off by default):**

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DIGITAL_MIND_RERANK` | `off` | Set to `on` to re‑rank the retrieved set with a hosted cross‑encoder. |
| `DIGITAL_MIND_RERANK_PROVIDER` | `voyage` | `voyage` or `cohere`. |
| `DIGITAL_MIND_RERANK_MODEL` | provider default | e.g. `rerank-2` (Voyage), `rerank-english-v3.0` (Cohere). |
| `DIGITAL_MIND_RERANK_CANDIDATES` | `TOP_K × 4` | How many candidates to pool before re‑ranking down to `TOP_K`. |
| `VOYAGE_API_KEY` / `COHERE_API_KEY` | _(one required for rerank)_ | Key for the chosen re‑ranker. |

**Milestone 5 — conversation memory (optional, off by default):** memory activates
automatically once `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set (the same pair used
for hybrid retrieval) and the memory migration is applied — no extra variable. It is
best‑effort: a logging failure never affects a reply.

**Milestone 6 — admin area (optional, off by default):**

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DIGITAL_MIND_ADMIN_TOKEN` | _(unset)_ | Shared bearer token for `/admin`. Unset ⇒ the endpoint returns 503 and the page shows only its gate. |

Set `MOONSHOT_API_KEY` and/or `GEMINI_API_KEY` in **Vercel → Project → Settings →
Environment Variables**.

### Choosing a model (Kimi K2 / Gemini)

When two or more providers are configured, a compact switcher appears at the top of the chat
panel. The visitor's choice is remembered for the session (`sessionStorage`) and sent with
each message as a provider **id** — never a key. The server validates the id against the
configured providers and falls back to `DIGITAL_MIND_PROVIDER` (or the first configured
provider) if it's missing or unknown. With a single provider configured the switcher is
hidden and that provider is used. Model ids and API base URLs are env‑overridable, so
pointing at a new model — or Moonshot's regional endpoint — never needs a code change.

## Security & permissions

- **Only `visibility: "public"` chunks are ever retrievable** by the public endpoint. The
  ingestion script marks posts with `draft: true` as skipped and `unlisted: true` as
  non‑public, and the retriever filters on `visibility` — so unapproved knowledge never
  reaches visitors. This is the seed of the document‑permission model the admin area builds on.
- **API keys stay server‑side.** The browser only ever talks to the same‑origin endpoint;
  provider keys never leave the function. The model switcher sends only a provider **id**,
  which the server validates against the configured providers before use.
- **No CSP relaxation.** Same‑origin calls satisfy the existing `connect-src 'self'`.
- **Model output is rendered safely** — Markdown is rendered without raw HTML, and links
  open with `rel="noopener noreferrer nofollow"`.
- **The admin area is locked down.** `/admin` requires the shared `DIGITAL_MIND_ADMIN_TOKEN`
  (timing‑safe check; 503 when unset, 401 on mismatch), is served `noindex`, and reads/writes
  only through RLS‑locked, service‑role‑only tables. Conversation memory and usage logs live
  in those same locked tables — never exposed to the browser.

## Updating the knowledge base

The index is rebuilt automatically on every deploy (it's the first step of `npm run build`).
To regenerate it locally after adding or editing content:

```bash
npm run digital-mind:index
```

The pipeline runs a set of **source connectors**, each emitting the same `Chunk` contract:

- **Blog + About** — the site's Markdown/MDX (`src/content/blog/**`, `src/pages/about.mdx`). Always on.
- **Local documents** — anything in `content/knowledge/` (Markdown, txt, PDF, DOCX). Always on.
  See that folder's README for supported types and frontmatter. Only `public` docs are written
  to the committed index.
- **GitHub** — public repos' READMEs + metadata. Opt‑in via `DIGITAL_MIND_GITHUB_REPOS` (a
  `owner/repo` list) or `DIGITAL_MIND_GITHUB_USER`; public repos need no token, `GITHUB_TOKEN`
  raises rate limits. Network failures degrade gracefully — they never fail the build.

Adding a new source type (image OCR, audio/video transcripts, Notion, Drive, …) means writing
one more connector that emits `Chunk`s; nothing downstream changes.

## Hybrid retrieval (Milestone 2)

Lexical BM25 is the zero‑config default and always works. Hybrid retrieval adds dense
(vector) search and fuses it with the keyword results using **Reciprocal Rank Fusion**, for
better recall on paraphrased or conceptual questions. It is **dormant until fully
configured** — a partial setup silently stays on lexical, so it can never break the live
chat. The dispatcher also degrades to lexical if embeddings or the vector store error at
request time.

To enable it:

1. **Apply the schema** to your Supabase project (pgvector table + `match_dm_chunks`):
   ```bash
   supabase db push            # or paste supabase/migrations/*.sql into the SQL editor
   ```
2. **Set the env vars** from the Milestone 2 table above (`DIGITAL_MIND_RETRIEVAL=hybrid`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and an embeddings key). Keep
   `DIGITAL_MIND_EMBEDDINGS_DIM` in sync with the model and the SQL `vector(N)` column.
3. **Embed the index** into pgvector (re‑run after content changes):
   ```bash
   npm run digital-mind:embed
   ```

The retrieval dispatcher lives in `_lib/retrieval.mjs` and exposes the same
`retrieve(query)` shape as Milestone 1, so the chat endpoint is unchanged. It composes the
stages — lexical → (optional) hybrid fusion → (optional) re‑ranking — reporting the active
combination in its `mode` (e.g. `hybrid+rerank`).

## Re‑ranking (Milestone 4)

Re‑ranking adds a hosted cross‑encoder pass **on top of** whatever retrieval is active. When
enabled, the dispatcher pools a larger candidate set (`RERANK_CANDIDATES`, default `TOP_K × 4`),
scores each candidate against the query with the re‑ranker, and keeps the best `TOP_K`. This
sharpens precision — the model sees the most relevant chunks first — and works with either
lexical or hybrid retrieval.

Like hybrid, it is **dormant until requested and credentialed** (`DIGITAL_MIND_RERANK=on` plus
a provider key) and **degrades gracefully**: if the re‑ranker errors or returns nothing, the
dispatcher falls back to the pre‑rank ordering. Providers are pluggable via `_lib/reranker.mjs`
(Voyage `rerank-2`, Cohere `rerank-english-v3.0`); adding another is one function.

## Conversation memory & usage (Milestone 5)

When Supabase is configured, each turn is persisted server‑side and every reply logs token
usage — powering the admin dashboard and long‑term attribution. The browser sends a stable
`conversationId` (generated client‑side, kept in `sessionStorage`) so a session's turns group
together. Persistence is **best‑effort**: `saveTurn`/`logUsage` swallow their own errors, so a
database hiccup can never break or slow a reply. Only public‑facing content is ever stored, and
the tables are **RLS‑locked** — reachable only by the service role from the server, never the
browser. Clearing the chat in the UI starts a fresh `conversationId`.

## Admin area (Milestone 6)

`/admin` is a token‑gated dashboard for running the assistant without a redeploy:

- **Overview** — usage totals (turns, input/output tokens, by model) and the live retrieval /
  embeddings / memory configuration.
- **Conversations** — review persisted sessions and drill into individual message threads.
- **Documents** — upload a document (Markdown/text) that is chunked, embedded, and upserted
  straight into the live hybrid index, or delete a previously uploaded one. (Uploads require
  hybrid retrieval; without it, add documents via `content/knowledge/` at build time instead.)
- **Prompt** — edit the assistant's persona / system‑prompt override, stored in `dm_config`
  and picked up by the chat endpoint within minutes via a short per‑instance cache.

Every request is authenticated with the shared `DIGITAL_MIND_ADMIN_TOKEN` using a
timing‑safe comparison. With no token configured the endpoint returns **503** and the page
renders only its gate — nothing is reachable unauthenticated, and the page is served
`noindex` so crawlers skip it. Admin logic lives in `_lib/admin.mjs` (pure, unit‑tested) with
`admin.ts` as a thin transport wrapper.

## Local development

```bash
npm run digital-mind:index   # (re)build the knowledge index
npm run digital-mind:embed   # embed the index into Supabase (no-op unless hybrid is configured)
npm run build                # production build (per project policy; do not use dev in agents)
npm test                     # unit tests for chunking + retrieval + fusion
```

The chat endpoint is a Vercel Function, so it runs on Vercel (or `vercel dev`), not under
`astro preview`. The UI degrades gracefully when the endpoint is unavailable.

## Roadmap

Milestone 1 was intentionally the thin, UX‑first slice; each later milestone fills in behind
the same UI and contracts:

1. **UX‑first working chat** ✅ — floating button, themed streaming chat, lexical retrieval
   over existing content, citations, follow‑ups, session memory.
2. **Vector/hybrid retrieval** ✅ — Supabase Postgres + `pgvector`, provider‑agnostic
   embeddings (Voyage/OpenAI), and vector + keyword fusion (RRF), dropped in behind
   `retrieve()` and off by default. Hosted **re‑ranking** ✅ now layers a cross‑encoder pass
   (Voyage/Cohere) over the retrieved set.
3. **Ingestion connectors** ✅ (first set) — a connector pipeline with local documents
   (Markdown/txt/PDF/DOCX via `content/knowledge/`) and GitHub public repos, all emitting the
   same `Chunk` contract. Next: image OCR, audio/video transcripts, and hosted connectors
   (YouTube, Drive, Notion, Obsidian).
4. **Conversation memory + attribution** ✅ — best‑effort server‑side chat persistence and
   usage logging (Supabase, RLS‑locked), grouped by a client‑side `conversationId`.
5. **Admin area** ✅ — a token‑gated `/admin` dashboard for usage monitoring, conversation
   review, document upload/delete into the live index, and persona/prompt management. Next:
   ingestion logs and per‑document permissions.
6. **Future integrations** — voice interface, vision models, and knowledge graphs.
