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
 *
 * `mode: "route_classify"` serves the frontend's model router ("Auto"): it
 * labels one user message LIGHT / STANDARD / HEAVY. The prompt, model and an
 * 8-token cap are fixed here; only the last user message is forwarded,
 * truncated, and the browser never sees a key. It has its own rate bucket so
 * routing can't starve the guide (or vice versa).
 */

const GEMINI_OPENAI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_OUTPUT_TOKENS = 2048;
const MAX_REQUEST_BYTES = 200_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 40;

const ROUTE_CLASSIFY_MODE = "route_classify";
const ROUTE_CLASSIFY_MODEL = "gemini-2.5-flash-lite";
const ROUTE_CLASSIFY_MAX_TOKENS = 8;
const ROUTE_CLASSIFY_MAX_INPUT_CHARS = 4000;
const ROUTE_CLASSIFY_MAX_CALLS = 30;
const ROUTE_CLASSIFY_PROMPT = [
  "You route requests to an AI coding agent between model tiers.",
  "Reply with exactly one word:",
  "LIGHT - chit-chat, short questions, trivial edits, summaries.",
  "STANDARD - ordinary coding tasks touching one area.",
  "HEAVY - multi-file refactors, architecture, hard debugging, security,",
  "performance or anything needing deep multi-step reasoning.",
].join("\n");

/**
 * `mode: "plan_guide"` asks for a whole guide as one JSON plan (no tools),
 * so the browser can show every step after the first without another call.
 */
const PLAN_GUIDE_MODE = "plan_guide";
const PLAN_GUIDE_MAX_TOKENS = 2048;

const recentCalls = new Map<string, number[]>();

function isRateLimited(
  key: string,
  now: number,
  maxCalls = RATE_LIMIT_MAX_CALLS,
): boolean {
  const calls = (recentCalls.get(key) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  calls.push(now);
  recentCalls.set(key, calls);
  return calls.length > maxCalls;
}

function lastUserText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as { role?: unknown; content?: unknown };
    if (m?.role === "user" && typeof m.content === "string") {
      return m.content.slice(0, ROUTE_CLASSIFY_MAX_INPUT_CHARS);
    }
  }
  return "";
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

  const isClassify = body.mode === ROUTE_CLASSIFY_MODE;
  const rateKey = isClassify ? `${userId}:${ROUTE_CLASSIFY_MODE}` : userId;
  if (
    isRateLimited(
      rateKey,
      Date.now(),
      isClassify ? ROUTE_CLASSIFY_MAX_CALLS : RATE_LIMIT_MAX_CALLS,
    )
  ) {
    return jsonResponse({ error: "rate_limited" }, { status: 429 });
  }

  let upstreamBody: Record<string, unknown>;
  if (isClassify) {
    const text = lastUserText(body.messages);
    if (!text) {
      return jsonResponse({ error: "messages_required" }, { status: 400 });
    }
    upstreamBody = {
      model: ROUTE_CLASSIFY_MODEL,
      messages: [
        { role: "system", content: ROUTE_CLASSIFY_PROMPT },
        { role: "user", content: text },
      ],
      max_tokens: ROUTE_CLASSIFY_MAX_TOKENS,
      temperature: 0,
    };
  } else if (body.mode === PLAN_GUIDE_MODE) {
    upstreamBody = {
      model: Deno.env.get("AI_GUIDE_MODEL") ?? DEFAULT_MODEL,
      messages: body.messages,
      max_tokens: PLAN_GUIDE_MAX_TOKENS,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
    };
  } else {
    upstreamBody = {
      model: Deno.env.get("AI_GUIDE_MODEL") ?? DEFAULT_MODEL,
      messages: body.messages,
      tools: body.tools,
      tool_choice: body.tools ? "required" : undefined,
      max_tokens: MAX_OUTPUT_TOKENS,
      // A small thinking budget: the default pass roughly doubled each
      // step's latency, but none at all made the picks sloppy (empty tips,
      // hidden elements). "low" keeps steps quick and the picks sound.
      reasoning_effort: "low",
    };
  }

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
