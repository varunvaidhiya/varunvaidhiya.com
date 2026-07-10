// Digital Mind — provider discovery endpoint (Vercel Serverless Function).
//
// GET /api/digital-mind/providers -> { providers: [{id,label,model}], default }
//
// The static site can't know at build time which LLM providers are credentialed
// (keys live server-side), so the chat widget fetches this to render its
// switcher. Only configured providers are returned, and only their public
// metadata — never keys.

import { getConfig } from "./_lib/config.mjs";

export const runtime = "nodejs";

const config = getConfig();

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({ providers: config.providers, default: config.defaultProvider ?? null }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
}
