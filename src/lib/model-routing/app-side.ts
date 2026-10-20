import type { ProfileInfo } from "@openhands/typescript-client";
import { DeepWikiServiceError } from "#/api/deepwiki-service/deepwiki-service.api";
import { KT_LLM_MODEL, KT_LLM_PROVIDER } from "#/lib/knowledge/kt-model";
import { useModelRoutingStore } from "#/stores/model-routing-store";
import { buildCandidates } from "./catalog";
import { routeSync } from "./router";
import type { RouteCandidate, RouteTask, RoutingDecision } from "./types";

/**
 * Routing for the app's own AI calls (KT docs, KT Ask, Mermaid repair, Video
 * narration). Those go through the DeepWiki service, which holds provider
 * keys in its own environment — so only a provider + model name ever leaves
 * the browser, never a profile's api_key or base_url.
 */
// @spec MR-012 — App-side routing through DeepWiki
export interface AppRoute {
  provider: string;
  model: string;
}

export type AppRouteTask = Extract<
  RouteTask,
  "kt_generate" | "kt_ask" | "mermaid_repair" | "narration"
>;

/** Providers DeepWiki has keys for. Comma-separated, e.g. `google,openai`. */
export const DEEPWIKI_PROVIDERS_ENV = "VITE_DEEPWIKI_PROVIDERS";
const DEFAULT_DEEPWIKI_PROVIDERS = [KT_LLM_PROVIDER];

export function getDeepWikiProviderAllowlist(
  raw: string | undefined = import.meta.env[DEEPWIKI_PROVIDERS_ENV] as
    | string
    | undefined,
): string[] {
  const parsed = (raw ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_DEEPWIKI_PROVIDERS;
}

/** Models DeepWiki can always serve with its default Google key. */
const BUILTIN_APP_MODELS: AppRoute[] = [
  { provider: KT_LLM_PROVIDER, model: KT_LLM_MODEL },
  { provider: KT_LLM_PROVIDER, model: "gemini-2.5-flash" },
];

/** LiteLLM-style model id → DeepWiki provider/model, or null. */
export function mapModelToDeepWiki(model: string): AppRoute | null {
  const id = model.trim();
  const lower = id.toLowerCase();
  const strip = (prefix: string) => id.slice(prefix.length);
  if (/^(gemini|google|vertex_ai)\//.test(lower))
    return { provider: "google", model: id.split("/").slice(1).join("/") };
  if (lower.startsWith("gemini-")) return { provider: "google", model: id };
  if (lower.startsWith("openrouter/"))
    return { provider: "openrouter", model: strip("openrouter/") };
  if (lower.startsWith("openai/"))
    return { provider: "openai", model: strip("openai/") };
  if (/^(gpt-|o\d)/.test(lower)) return { provider: "openai", model: id };
  if (lower.startsWith("ollama/") || lower.startsWith("ollama_chat/"))
    return { provider: "ollama", model: id.split("/").slice(1).join("/") };
  if (lower.startsWith("bedrock/"))
    return { provider: "bedrock", model: strip("bedrock/") };
  if (lower.startsWith("azure/"))
    return { provider: "azure", model: strip("azure/") };
  return null;
}

/** Health/candidate key for an app-side route (namespaced from profiles). */
export const appRouteKey = (route: AppRoute) =>
  `deepwiki:${route.provider}:${route.model}`;

export function parseAppRouteKey(key: string): AppRoute | null {
  const [ns, provider, ...rest] = key.split(":");
  if (ns !== "deepwiki" || !provider || rest.length === 0) return null;
  return { provider, model: rest.join(":") };
}

export function buildAppCandidates(
  profiles: ProfileInfo[],
  allowlist: string[] = getDeepWikiProviderAllowlist(),
): RouteCandidate[] {
  const routes = new Map<string, AppRoute>();
  const add = (route: AppRoute | null) => {
    if (route && allowlist.includes(route.provider))
      routes.set(appRouteKey(route), route);
  };
  BUILTIN_APP_MODELS.forEach(add);
  profiles.forEach((p) => p.model && add(mapModelToDeepWiki(p.model)));

  const pseudoProfiles: ProfileInfo[] = [...routes.entries()].map(
    ([key, route]) => ({
      name: key,
      model: route.model,
      base_url: null,
      api_key_set: true,
    }),
  );
  return buildCandidates(pseudoProfiles);
}

export function resolveAppRoute(
  task: AppRouteTask,
  options: { exclude?: string[] } = {},
): { route: AppRoute; decision: RoutingDecision | null } {
  const { profiles, prefs, health } = useModelRoutingStore.getState();
  const candidates = buildAppCandidates(profiles).filter(
    (c) => !options.exclude?.includes(c.profileName),
  );
  const fallback: AppRoute = { provider: KT_LLM_PROVIDER, model: KT_LLM_MODEL };
  if (candidates.length === 0) return { route: fallback, decision: null };

  const { decision } = routeSync(
    { task },
    {
      candidates,
      policy: prefs.policy,
      budgetUsd: null,
      excludedProfiles: [],
      health,
      now: Date.now(),
    },
  );
  const route = decision.profileName
    ? parseAppRouteKey(decision.profileName)
    : null;
  return { route: route ?? fallback, decision };
}

const isRetryableDeepWikiError = (error: unknown) =>
  error instanceof DeepWikiServiceError &&
  (error.status === 429 || error.status >= 500);

/**
 * Runs an app-side AI call on the routed model, recording health and retrying
 * once on the next candidate when DeepWiki reports a rate limit or outage.
 */
export async function withAppRoute<T>(
  task: AppRouteTask,
  call: (route: AppRoute) => Promise<T>,
): Promise<T> {
  const store = useModelRoutingStore.getState();
  const first = resolveAppRoute(task);
  if (first.decision) store.recordDecision(first.decision);
  const firstKey = appRouteKey(first.route);
  const startedAt = Date.now();
  try {
    const result = await call(first.route);
    store.markSuccess(firstKey, Date.now() - startedAt);
    return result;
  } catch (error) {
    if (!isRetryableDeepWikiError(error)) throw error;
    store.markFailure(
      firstKey,
      (error as DeepWikiServiceError).status === 429
        ? "rate_limit"
        : "unavailable",
    );
    const second = resolveAppRoute(task, { exclude: [firstKey] });
    const secondKey = appRouteKey(second.route);
    if (secondKey === firstKey) throw error;
    if (second.decision)
      store.recordDecision({
        ...second.decision,
        source: "fallback",
        reasons: [
          (error as DeepWikiServiceError).status === 429
            ? "fallback_rate_limit"
            : "fallback_unavailable",
        ],
      });
    const result = await call(second.route);
    store.markSuccess(secondKey);
    return result;
  }
}
