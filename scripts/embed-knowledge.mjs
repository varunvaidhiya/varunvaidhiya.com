// Embed the knowledge index into Supabase pgvector (Milestone 2, opt-in).
//
// Reads api/digital-mind/_lib/knowledge-index.json (built by digital-mind:index),
// embeds each chunk, and upserts it into the dm_chunks table. This is separate
// from `npm run build` because it needs an embeddings key + Supabase and makes a
// network round-trip; run it after content changes when hybrid retrieval is on.
//
// Usage: npm run digital-mind:embed
// No-ops (exit 0) when hybrid isn't fully configured, so it's safe in any env.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../api/digital-mind/_lib/config.mjs";
import { getEmbeddingsProvider } from "../api/digital-mind/_lib/embeddings.mjs";
import { createVectorStore } from "../api/digital-mind/_lib/vector-store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_FILE = path.join(ROOT, "api/digital-mind/_lib/knowledge-index.json");
const BATCH = 64;

function embedText(chunk) {
  return [chunk.title, chunk.heading, chunk.text].filter(Boolean).join("\n");
}

async function main() {
  const config = getConfig();

  if (!config.hybridEnabled) {
    console.log(
      "[digital-mind] hybrid retrieval is not fully configured — skipping embedding upsert.\n" +
        "  To enable, set: DIGITAL_MIND_RETRIEVAL=hybrid, SUPABASE_URL,\n" +
        "  SUPABASE_SERVICE_ROLE_KEY, and " +
        (config.embeddingsProvider === "voyage" ? "VOYAGE_API_KEY" : "OPENAI_API_KEY") +
        " — then apply supabase/migrations and re-run.",
    );
    return;
  }

  const index = JSON.parse(await readFile(INDEX_FILE, "utf8"));
  const chunks = Array.isArray(index.chunks) ? index.chunks : [];
  if (chunks.length === 0) {
    console.log("[digital-mind] knowledge index is empty — nothing to embed.");
    return;
  }

  const embeddings = getEmbeddingsProvider(config);
  const store = createVectorStore(config);
  console.log(
    `[digital-mind] embedding ${chunks.length} chunk(s) via ${embeddings.name}/${embeddings.model} ` +
      `(${embeddings.dimensions}d) → Supabase…`,
  );

  let done = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const vectors = await embeddings.embed(batch.map(embedText));
    const rows = batch.map((chunk, j) => ({ ...chunk, embedding: vectors[j] }));
    await store.upsert(rows);
    done += batch.length;
    console.log(`[digital-mind]   upserted ${done}/${chunks.length}`);
  }

  console.log(`[digital-mind] done — ${done} chunk(s) embedded and indexed.`);
}

main().catch((err) => {
  console.error("[digital-mind] embed failed:", err.message ?? err);
  process.exit(1);
});
