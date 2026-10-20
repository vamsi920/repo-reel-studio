import { supabase } from "#/lib/data-platform/client";
import {
  createRoutingClassifier,
  parseClassifierLabel,
  type ClassifierTransport,
  type RoutingClassifier,
} from "./classifier";

/**
 * Default classifier transport: the `ai-guide` Edge Function in its
 * `route_classify` mode. The model key stays server-side; the function pins a
 * tiny model, an 8-token answer and its own prompt, and forwards only the
 * truncated user text. Signed-out users get a 401 and the scorer decides.
 */
export const ROUTE_CLASSIFY_FUNCTION = "ai-guide";
export const ROUTE_CLASSIFY_MODE = "route_classify";

export const supabaseClassifierTransport: ClassifierTransport = {
  async classify(text, signal) {
    if (!supabase) return null;
    const { data, error } = await supabase.functions.invoke(
      ROUTE_CLASSIFY_FUNCTION,
      {
        body: {
          mode: ROUTE_CLASSIFY_MODE,
          messages: [{ role: "user", content: text }],
        },
        signal,
      },
    );
    if (error || !data) return null;
    const content = (
      data as { choices?: { message?: { content?: unknown } }[] }
    ).choices?.[0]?.message?.content;
    return parseClassifierLabel(content);
  },
};

let shared: RoutingClassifier | null = null;

/** One bounded classifier per tab, so the hourly cap is shared. */
export function getRoutingClassifier(): RoutingClassifier | null {
  if (!supabase) return null;
  if (!shared) shared = createRoutingClassifier(supabaseClassifierTransport);
  return shared;
}
