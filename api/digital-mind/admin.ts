// Digital Mind — admin endpoint (Vercel Serverless Function).
//
// GET/POST /api/digital-mind/admin?action=...  (Authorization: Bearer <token>)
//
// Thin wrapper: it builds the config + stores and delegates auth + dispatch to
// handleAdminRequest (in _lib/admin.mjs). Every request requires the shared
// DIGITAL_MIND_ADMIN_TOKEN; without it configured the endpoint returns 503, and
// a bad token returns 401 — nothing is reachable unauthenticated.

import { createAdmin, handleAdminRequest } from "./_lib/admin.mjs";
import { getConfig } from "./_lib/config.mjs";
import { createMemory } from "./_lib/memory.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

const config = getConfig();
const memory = createMemory(config);
const admin = createAdmin(config);

async function respond(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());

  let body: any;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  const { status, data } = await handleAdminRequest(
    {
      method: req.method,
      action: url.searchParams.get("action") ?? undefined,
      params,
      body,
      authHeader: req.headers.get("authorization") ?? "",
    },
    { config, memory, admin }
  );

  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const GET = respond;
export const POST = respond;
