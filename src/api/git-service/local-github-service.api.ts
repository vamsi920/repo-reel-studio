import type { BranchPage, RepositoryPage } from "#/types/git";
import { supabase } from "#/lib/data-platform/client";

export type NeodevexPullRequestState = "open" | "merged" | "closed";

/**
 * A real GitHub pull request opened by one of this fork's automations,
 * identified by its `neodevex/<slug>/...` branch name (see `branchNamingRule`
 * in `src/manifests/automation-prompt-rules.ts`) -- there is no durable id
 * linking an `AutomationRun` to a PR, so this is reconstructed from GitHub
 * itself rather than read off any local record.
 */
export interface NeodevexPullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: string;
  branch: string;
  state: NeodevexPullRequestState;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

export interface NeodevexPullRequestPage {
  items: NeodevexPullRequest[];
  next_page_id: string | null;
}

/**
 * Thrown when the `github-api-proxy` edge function call itself fails --
 * network error, the caller has no GitHub connection (edge function returns
 * 404 `not_connected`), an expired/invalid token, or a real GitHub API error
 * (502). Every caller in this file used to swallow this into an empty page,
 * which is indistinguishable from "genuinely zero repositories" in the UI --
 * `GitRepoDropdown` already renders `&lt;ErrorMessage isError={isError} /&gt;`, it
 * just never received a real error to display. Throwing here lets that
 * existing error state (and this page's own error state) actually fire.
 */
export class GithubProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubProxyError";
  }
}

async function invokeProxy<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) {
    throw new GithubProxyError("Supabase is not configured");
  }
  const { data, error } = await supabase.functions.invoke("github-api-proxy", {
    body,
  });
  if (error) {
    throw new GithubProxyError(
      error instanceof Error
        ? error.message
        : "GitHub connection request failed",
    );
  }
  return data as T;
}

export async function searchLocalGithubRepositories(args: {
  query?: string;
  limit?: number;
  pageId?: string;
}): Promise<RepositoryPage> {
  return invokeProxy<RepositoryPage>({
    action: "search",
    query: args.query,
    pageId: args.pageId,
  });
}

export async function retrieveLocalGithubRepositories(args: {
  pageId?: string;
}): Promise<RepositoryPage> {
  return invokeProxy<RepositoryPage>({
    action: "repos",
    pageId: args.pageId,
  });
}

export async function listNeodevexPullRequests(args: {
  pageId?: string;
}): Promise<NeodevexPullRequestPage> {
  return invokeProxy<NeodevexPullRequestPage>({
    action: "list_prs",
    pageId: args.pageId,
  });
}

export async function getLocalGithubRepositoryBranches(args: {
  repository: string;
  query?: string;
  pageId?: string;
}): Promise<BranchPage> {
  return invokeProxy<BranchPage>({
    action: "branches",
    repository: args.repository,
    query: args.query,
    pageId: args.pageId,
  });
}
