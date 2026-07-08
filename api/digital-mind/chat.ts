// Digital Mind — chat endpoint (Vercel Serverless Function, same-origin).
//
// POST /api/digital-mind/chat  { messages: {role,content}[] }  -> text/event-stream
//
// This lives in a root `/api` directory so it deploys as a Vercel Function
// alongside the untouched static Astro build. Because it is same-origin, the
// site's strict CSP (`connect-src 'self'`) already permits the browser to call
// it — no CSP change is required.
//
// Milestone 1 = UX-first: retrieve public chunks from the pre-built knowledge
// index (lexical BM25), then stream a grounded answer from Claude with source
// citations and suggested follow-ups. The provider is swappable via config; the
// retrieval interface is the same one a vector/hybrid backend will expose later.

import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "./_lib/config.mjs";
import knowledge from "./_lib/knowledge-index.json";
import { buildFollowups, buildSources, buildSystemPrompt } from "./_lib/prompt.mjs";
import { buildRetriever } from "./_lib/retrieve.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTENT_CHARS = 6000;

// Built once per cold start; the index is static at deploy time.
const retriever = buildRetriever((knowledge as { chunks: any[] }).chunks);

type ChatMessage = { role: "user" | "assistant"; content: string };

function sanitizeHistory(input: unknown, maxHistory: number): ChatMessage[] {
  const arr = Array.isArray(input) ? input : [];
  const cleaned = arr
    .filter(
      (m: any) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, MAX_CONTENT_CHARS),
    }))
    .slice(-maxHistory);

  // The Messages API requires the first turn to be a user turn.
  while (cleaned.length > 0 && cleaned[0].role === "assistant") cleaned.shift();
  return cleaned;
}

export async function POST(req: Request): Promise<Response> {
  const config = getConfig();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const history = sanitizeHistory(body?.messages, config.maxHistory);
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const query = lastUser?.content ?? "";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        if (!query) {
          send({ type: "error", message: "Ask me something about my work and I'll answer." });
          send({ type: "done" });
          return;
        }
        if (!config.hasApiKey) {
          send({
            type: "error",
            message:
              "The Digital Mind isn't connected to a model yet. (Set ANTHROPIC_API_KEY to enable it.)",
          });
          send({ type: "done" });
          return;
        }

        const contextChunks = retriever.retrieve(query, { topK: config.topK });
        send({ type: "sources", sources: buildSources(contextChunks) });

        const anthropic = new Anthropic();
        const modelStream = anthropic.messages.stream({
          model: config.model,
          max_tokens: config.maxTokens,
          system: buildSystemPrompt({ contextChunks }),
          messages: history,
        });

        for await (const event of modelStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send({ type: "token", text: event.delta.text });
          }
        }

        const final = await modelStream.finalMessage();
        if (final.stop_reason === "refusal") {
          send({
            type: "error",
            message:
              "I'd rather not answer that one — try asking about my projects or engineering work.",
          });
        }

        send({ type: "followups", followups: buildFollowups(contextChunks) });
        send({ type: "done" });
      } catch (err) {
        console.error("[digital-mind] chat error:", err);
        send({
          type: "error",
          message: "Something went wrong reaching the Digital Mind. Please try again in a moment.",
        });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Disable proxy buffering so tokens flush as they stream.
      "X-Accel-Buffering": "no",
    },
  });
}
