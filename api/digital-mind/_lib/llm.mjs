// LLM client for the Digital Mind chat endpoint.
//
// Kimi K2 (Moonshot) and Gemini both expose an OpenAI-compatible
// /chat/completions endpoint, so a single streaming client serves both — the
// provider is chosen per request by its id (see config.mjs → providerConfigs).
// Keys are read from config (server-side) and never come from the request.
// `fetchImpl` is injectable so the streaming path is unit-tested without network.

/**
 * Resolve the provider to use for a request. Falls back to the configured
 * default when the requested id is missing or not credentialed.
 * @returns {string|undefined} a configured provider id, or undefined if none.
 */
export function resolveProviderId(config, requested) {
  if (requested && config.providerConfigs?.[requested]?.configured) return requested;
  return config.defaultProvider;
}

/** OpenAI usage → the {input_tokens, output_tokens} shape memory.logUsage expects. */
function normalizeUsage(u) {
  if (!u) return undefined;
  return { input_tokens: u.prompt_tokens ?? 0, output_tokens: u.completion_tokens ?? 0 };
}

/** Parse an SSE body (web ReadableStream) into successive `data:` payloads. */
async function* parseSSE(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dataLine = (frame) => frame.split("\n").find((l) => l.startsWith("data:"));

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = dataLine(frame);
      if (line) {
        const data = line.slice(5).trim();
        if (data) yield data;
      }
    }
  }
  const tail = dataLine(buffer);
  if (tail) {
    const data = tail.slice(5).trim();
    if (data) yield data;
  }
}

/**
 * Stream a grounded answer from the selected provider.
 *
 * Yields `{ text }` for each token delta, `{ usage }` once (final token counts,
 * when the provider reports them), and `{ filtered: true }` if the provider
 * stops for content filtering. Throws on a non-OK HTTP response.
 *
 * @param {{
 *   config: import("./config.mjs").DigitalMindConfig,
 *   providerId: string,
 *   system: string,
 *   messages: {role: "user"|"assistant", content: string}[],
 *   maxTokens: number,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export async function* streamChat({ config, providerId, system, messages, maxTokens, fetchImpl }) {
  const doFetch = fetchImpl ?? fetch;
  const p = config.providerConfigs?.[providerId];
  if (!p || !p.configured) throw new Error(`LLM provider "${providerId}" is not configured`);

  const payloadMessages = system ? [{ role: "system", content: system }, ...messages] : messages;

  const res = await doFetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: maxTokens,
      messages: payloadMessages,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text())?.slice(0, 300) ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`${p.label} API error ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  for await (const data of parseSSE(res.body)) {
    if (data === "[DONE]") return;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      continue; // skip malformed frame
    }
    const choice = json.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) yield { text: delta };
    if (choice?.finish_reason === "content_filter") yield { filtered: true };
    if (json.usage) yield { usage: normalizeUsage(json.usage) };
  }
}
