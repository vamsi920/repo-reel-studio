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
export type GithubProxyErrorCode =
  | "unauthorized"
  | "not_connected"
  | "missing_repository"
  | "unknown_action"
  | "github_auth_error"
  | "github_api_error";

export class GithubProxyError extends Error {
  /**
   * The raw `github-api-proxy` error code (see `PROXY_ERROR_MESSAGES`
   * below), when the edge function returned one. Callers that need to
   * distinguish failure reasons (e.g. "connection is dead" vs. "GitHub is
   * temporarily down") should check this rather than matching on
   * `message`, which is a friendly, i18n-facing string that can change
   * wording without notice.
   */
  code?: GithubProxyErrorCode;

  constructor(message: string, code?: GithubProxyErrorCode) {
    super(message);
    this.name = "GithubProxyError";
    this.code = code;
  }
}

const PROXY_ERROR_MESSAGES: Record<GithubProxyErrorCode, string> = {
  unauthorized: "You need to be signed in to browse GitHub repositories.",
  not_connected: "Connect your GitHub account before browsing repositories.",
  missing_repository: "No repository was specified.",
  unknown_action: "Unsupported GitHub proxy request.",
  github_auth_error:
    "Your GitHub connection isn't working. Reconnect it in Settings > Connections.",
  github_api_error: "GitHub is temporarily unreachable. Please try again.",
};

function isKnownProxyErrorCode(value: string): value is GithubProxyErrorCode {
  return value in PROXY_ERROR_MESSAGES;
}

/**
 * supabase-js's `FunctionsHttpError` hardcodes `error.message` to "Edge
 * Function returned a non-2xx status code" regardless of what the function
 * actually returned -- the real reason lives in the Response body on
 * `error.context`. Read it so callers (and the UI) see e.g. "not_connected"
 * or a real GitHub API error instead of that generic string.
 */
async function describeProxyError(
  error: unknown,
): Promise<{ message: string; code?: GithubProxyErrorCode }> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: string };
      if (body.error) {
        const code = isKnownProxyErrorCode(body.error) ? body.error : undefined;
        return {
          message: code ? PROXY_ERROR_MESSAGES[code] : body.error,
          code,
        };
      }
    } catch {
      // Response body wasn't JSON -- fall through to the generic message below.
    }
  }
  return {
    message:
      error instanceof Error
        ? error.message
        : "GitHub connection request failed",
  };
}

async function invokeProxy<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) {
    throw new GithubProxyError("Supabase is not configured");
  }
  const { data, error } = await supabase.functions.invoke("github-api-proxy", {
    body,
  });
  if (error) {
    const { message, code } = await describeProxyError(error);
    throw new GithubProxyError(message, code);
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
