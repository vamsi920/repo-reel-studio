import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

/**
 * OpenAI-compatible pass-through for the in-app AI guide (page-agent in
 * "guide mode", see src/components/features/tutorial/ai-guide/). The Gemini
 * key lives only here, as the GEMINI_API_KEY function secret, never in the
 * browser bundle.
 *
 * - Only real (non-anonymous) signed-in users may call it.
 * - The model and the output cap are fixed server-side; the browser can't
 *   pick a pricier model or ask for a huge completion.
 * - A small in-memory per-user limit stops a runaway client loop. It is per
 *   function instance, not global, which is enough for that purpose.
 */

const GEMINI_OPENAI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_OUTPUT_TOKENS = 2048;
const MAX_REQUEST_BYTES = 200_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 40;

const recentCalls = new Map<string, number[]>();

function isRateLimited(userId: string, now: number): boolean {
  const calls = (recentCalls.get(userId) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  calls.push(now);
  recentCalls.set(userId, calls);
  return calls.length > RATE_LIMIT_MAX_CALLS;
}

async function getRealUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user || user.is_anonymous) return null;
  return user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getRealUserId(req);
  if (!userId) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }
  if (isRateLimited(userId, Date.now())) {
    return jsonResponse({ error: "rate_limited" }, { status: 429 });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    return jsonResponse({ error: "not_configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (raw.length > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: "request_too_large" }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) {
    return jsonResponse({ error: "messages_required" }, { status: 400 });
  }

  const upstreamBody = {
    model: Deno.env.get("AI_GUIDE_MODEL") ?? DEFAULT_MODEL,
    messages: body.messages,
    tools: body.tools,
    tool_choice: body.tools ? "required" : undefined,
    max_tokens: MAX_OUTPUT_TOKENS,
    // Pointing at the next control is a lookup, not a reasoning task:
    // Gemini 2.5 Flash's default thinking pass roughly doubled each
    // step's latency for no better pick.
    reasoning_effort: "none",
  };

  const upstream = await fetch(GEMINI_OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(upstreamBody),
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    // Never echo the provider body back: it can include request details.
    console.error(`ai-guide upstream ${upstream.status}: ${text.slice(0, 500)}`);
    return jsonResponse(
      { error: "upstream_error", status: upstream.status },
      { status: 502 },
    );
  }
  return new Response(text, {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
