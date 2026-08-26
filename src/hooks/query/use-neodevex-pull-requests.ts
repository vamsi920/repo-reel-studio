import { useQuery } from "@tanstack/react-query";
import { listNeodevexPullRequests } from "#/api/git-service/local-github-service.api";
import type { NeodevexPullRequest } from "#/api/git-service/local-github-service.api";
import { useGithubConnection } from "./use-github-connection";
import { LOCAL_AUTOMATION_CATALOG } from "#/manifests/local-automation-catalog";

export const NEODEVEX_PULL_REQUESTS_QUERY_KEY = [
  "neodevex-pull-requests",
] as const;

/**
 * Slugs that don't come from a catalog entry at all, because the automation
 * that used them isn't created through the catalog's setup flow: the
 * Proactivation wizard (`proactivation-prompt.ts`) and the Jira instant
 * trigger builder (`jira-trigger-setup.ts`) each name their own branch
 * prefix directly.
 */
const NON_CATALOG_SLUG_LABELS: Readonly<Record<string, string>> = {
  proactivation: "Proactive Engineering (setup wizard)",
  "jira-instant-trigger": "Jira Issue to PR (instant trigger)",
};

/**
 * Every known `neodevex/<slug>` branch prefix mapped to a human label, built
 * from the catalog so it can't drift: a local catalog id is always
 * `neodevex-<slug>`, and `branchNamingRule(slug)` in every one of those
 * entries' prompts uses that same slug.
 */
const AUTOMATION_LABEL_BY_SLUG: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    LOCAL_AUTOMATION_CATALOG.map((entry) => [
      entry.id.replace(/^neodevex-/, ""),
      entry.name,
    ]),
  ),
  ...NON_CATALOG_SLUG_LABELS,
};

const BRANCH_SLUG_PATTERN = /^neodevex\/([a-z0-9-]+)\//;

/**
 * The automation slug embedded in a `neodevex/<slug>/...` branch name, or
 * null if the branch doesn't follow that convention. There is no durable id
 * linking a `AutomationRun` to the PR it opened, so this is the only
 * attribution available -- see `branchNamingRule`.
 */
export function automationSlugFromBranch(branch: string): string | null {
  return BRANCH_SLUG_PATTERN.exec(branch)?.[1] ?? null;
}

/** A human label for the slug, or the slug itself if it's from an automation not in the map (e.g. a future one). */
export function automationLabelFromBranch(branch: string): string {
  const slug = automationSlugFromBranch(branch);
  if (!slug) return "Unknown automation";
  return AUTOMATION_LABEL_BY_SLUG[slug] ?? slug;
}

export interface NeodevexPullRequestWithAutomation extends NeodevexPullRequest {
  automationLabel: string;
}

/** Hard ceiling on pages fetched per refresh, so a runaway history can't hang the page or exhaust the rate limit. */
const MAX_PAGES = 5;

async function fetchAllPages(): Promise<NeodevexPullRequestWithAutomation[]> {
  const all: NeodevexPullRequestWithAutomation[] = [];
  let pageId: string | undefined;

  // Sequential, not parallel: `next_page_id` from one response is required to
  // request the next, so there is nothing to parallelize.
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await listNeodevexPullRequests({ pageId });
    all.push(
      ...result.items.map((pr) => ({
        ...pr,
        automationLabel: automationLabelFromBranch(pr.branch),
      })),
    );
    if (!result.next_page_id) break;
    pageId = result.next_page_id;
  }

  return all;
}

/**
 * Every real GitHub pull request this fork's automations have opened, across
 * every repository the connected GitHub account can see -- see
 * `NEODEVEX_BRANCH_PREFIX` in `supabase/functions/github-api-proxy/index.ts`
 * for how they're found. Disabled until GitHub is actually connected, since
 * the underlying edge function 404s otherwise.
 */
export function useNeodevexPullRequests() {
  const { data: connection, isLoading: isConnectionLoading } =
    useGithubConnection();
  const isConnected = !!connection;

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: NEODEVEX_PULL_REQUESTS_QUERY_KEY,
    queryFn: fetchAllPages,
    enabled: isConnected,
    staleTime: 60 * 1000,
  });

  return {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
    isConnected,
    isConnectionLoading,
  };
}
