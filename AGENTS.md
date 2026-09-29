# AGENTS.md
## New Blog Post Workflow
- If user says “new blog post” without topic/title: ask for topic/title first.
- Pick branch name: short slug from topic/title.
- Scaffold file: `src/content/blog/<year>/<slug>.md`.
- Frontmatter: only set `title` from user input; keep required placeholders minimal (`description: "TBD"`, `draft: true`, `pubDatetime: <today>`).
- No body content; no invented outline.
- Open editor: `code <new-post-path>`.

## Cloud Agent
- Install with `npm ci`. Node 22 on the default image works; CI pins Node 20. Set `ASTRO_TELEMETRY_DISABLED=1` when running Astro.
- Dev server: `npm run dev -- --host 0.0.0.0 --port 4321`. Homepage, posts, tags, and the Ask Varun widget render without secrets.
- `npm test` runs the Digital Mind unit tests and does not need API keys. `npm run build` writes `dist/` plus the Pagefind index. Preview that build with `npm run preview -- --host 0.0.0.0 --port 4322`. Search in dev mode needs this index.
- The chat API is a Vercel function in `api/` and is not served by `astro dev` or `astro preview`. `MOONSHOT_API_KEY` or `GEMINI_API_KEY` is required only for live answers. Supabase and embeddings keys are optional and only used for hybrid retrieval, memory, and admin.
- `npm run check` currently fails on existing Biome issues in `src/utils/fetchGitHubCommits.ts` and `src/components/DeveloperJournal.astro`.
- Pagefind result links can 404 on preview because indexed URLs keep a trailing slash while `astro.config.mjs` sets `trailingSlash: "never"`. The post URLs without the slash return 200.
