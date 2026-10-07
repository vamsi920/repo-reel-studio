import { supabase } from "#/lib/data-platform/client";
import type { AiGuideErrorKind } from "./ai-guide-store";

/** Supabase Edge Function holding the model key (supabase/functions/ai-guide). */
export const AI_GUIDE_FUNCTION_NAME = "ai-guide";

export class AiGuideRequestError extends Error {
  constructor(readonly kind: AiGuideErrorKind) {
    super(`AI guide request failed: ${kind}`);
    this.name = "AiGuideRequestError";
  }
}

function errorKindForStatus(status: number): AiGuideErrorKind {
  if (status === 401) return "signed_out";
  if (status === 429) return "rate_limited";
  if (status === 503 || status === 404) return "unavailable";
  return "failed";
}

/**
 * page-agent's `customFetch`: forwards its OpenAI-style request body to the
 * `ai-guide` Edge Function with the signed-in user's session (added by
 * `functions.invoke`) and hands the JSON answer back as a Response.
 */
export async function proxyLlmFetch(
  _url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!supabase) throw new AiGuideRequestError("unavailable");
  const body =
    typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
  const { data, error } = await supabase.functions.invoke(
    AI_GUIDE_FUNCTION_NAME,
    { body, signal: init?.signal ?? undefined },
  );
  if (error) {
    const status = (error as { context?: Response }).context?.status ?? 0;
    throw new AiGuideRequestError(errorKindForStatus(status));
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * One JSON call to the `ai-guide` function in a given `mode` (for example
 * `plan_guide`). Kept free of page-agent so callers that only need a quick
 * answer don't pull its bundle in.
 */
export async function invokeAiGuide<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new AiGuideRequestError("unavailable");
  const { data, error } = await supabase.functions.invoke(
    AI_GUIDE_FUNCTION_NAME,
    { body, signal },
  );
  if (error) {
    const status = (error as { context?: Response }).context?.status ?? 0;
    throw new AiGuideRequestError(errorKindForStatus(status));
  }
  return data as T;
}
