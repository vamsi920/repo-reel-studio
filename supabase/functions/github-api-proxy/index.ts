import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { githubApiBaseUrl } from "../_shared/github.ts";

interface GithubConnectionRow {
  enterprise_host: string | null;
  encrypted_access_token: string;
}

async function getDecryptedConnection(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<{ token: string; host: string | null } | null> {
  const { data: connection } = await admin
    .from("github_connections")
    .select("enterprise_host, encrypted_access_token")
    .eq("user_id", userId)
    .maybeSingle<GithubConnectionRow>();
  if (!connection) {
    console.error(`No github_connections row for user ${userId}`);
    return null;
  }

  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    console.error("GITHUB_TOKEN_ENCRYPTION_KEY is not set");
    return null;
  }

  const { data: token, error: decryptError } = await admin.rpc(
    "decrypt_github_token",
    {
      ciphertext: connection.encrypted_access_token,
      encryption_key: encryptionKey,
    },
  );
  if (!token) {
    console.error(
      `decrypt_github_token returned no token for user ${userId}: ${decryptError?.message}`,
    );
    return null;
  }

  return { token, host: connection.enterprise_host };
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "neodevex-github-connections",
  };
}

function hasNextPage(response: Response): boolean {
  const link = response.headers.get("Link") ?? "";
  return /<[^>]+>;\s*rel="next"/.test(link);
}

function toGitRepository(repo: Record<string, unknown>) {
  return {
    id: String(repo.id),
    full_name: repo.full_name as string,
    git_provider: "github",
    is_public: !(repo.private as boolean),
    stargazers_count: repo.stargazers_count as number | undefined,
    pushed_at: repo.pushed_at as string | undefined,
    main_branch: repo.default_branch as string | undefined,
  };
}

function toBranch(branch: Record<string, unknown>) {
  const commit = branch.commit as Record<string, unknown> | undefined;
  return {
    name: branch.name as string,
    commit_sha: (commit?.sha as string | undefined) ?? "",
    protected: Boolean(branch.protected),
  };
}

async function handleRepos(
  apiBase: string,
  token: string,
  page: number,
  query: string | undefined,
) {
  const params = new URLSearchParams({
    per_page: "100",
    page: String(page),
    sort: "updated",
    affiliation: "owner,collaborator,organization_member",
  });
  const response = await fetch(`${apiBase}/user/repos?${params}`, {
    headers: githubHeaders(token),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`GitHub /user/repos failed (${response.status}): ${body}`);
    throw new Error(`GitHub API error (${response.status})`);
  }
  const repos = (await response.json()) as Record<string, unknown>[];
  const filtered = query
    ? repos.filter((repo) =>
        (repo.full_name as string)
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : repos;

  return {
    items: filtered.map(toGitRepository),
    next_page_id: hasNextPage(response) ? String(page + 1) : null,
  };
}

/**
 * The prefix every automation this fork owns names its branches with -- see
 * `branchNamingRule` in `src/manifests/automation-prompt-rules.ts`. This is
 * the only link between a real GitHub PR and the automation that opened it:
 * there is no durable id on either side to join on.
 */
const NEODEVEX_BRANCH_PREFIX = "neodevex/";

interface PullRequestDetail {
  id: number;
  number: number;
  title: string;
  html_url: string;
  base: { repo: { full_name: string } };
  head: { ref: string };
  draft: boolean;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

function toNeodevexPullRequest(pr: PullRequestDetail) {
  const state = pr.merged_at ? "merged" : pr.closed_at ? "closed" : "open";
  return {
    id: String(pr.id),
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    repository: pr.base.repo.full_name,
    branch: pr.head.ref,
    state,
    isDraft: pr.draft,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
    closedAt: pr.closed_at,
  };
}

/** Parses "https://api.github.com/repos/{owner}/{repo}" -> "{owner}/{repo}". */
function fullNameFromRepositoryUrl(repositoryUrl: string): string | null {
  const match = /\/repos\/([^/]+\/[^/]+)$/.exec(repositoryUrl);
  return match ? match[1] : null;
}

/**
 * GitHub's PR search results don't include the head branch name or an
 * authoritative merged state, so each candidate is confirmed with one
 * `GET /pulls/{number}` call. The `head:` search qualifier is a best-effort
 * partial match, not a guarantee, so results are filtered again here against
 * the exact prefix before anything is returned to the client.
 */
async function handlePulls(
  apiBase: string,
  token: string,
  page: number,
) {
  const params = new URLSearchParams({
    q: `is:pr head:${NEODEVEX_BRANCH_PREFIX}`,
    per_page: "50",
    page: String(page),
    sort: "created",
    order: "desc",
  });
  const searchResponse = await fetch(`${apiBase}/search/issues?${params}`, {
    headers: githubHeaders(token),
  });
  if (!searchResponse.ok) {
    const body = await searchResponse.text().catch(() => "");
    console.error(
      `GitHub /search/issues failed (${searchResponse.status}): ${body}`,
    );
    throw new Error(`GitHub API error (${searchResponse.status})`);
  }
  const search = (await searchResponse.json()) as {
    items: { number: number; repository_url: string }[];
  };

  const candidates = search.items
    .map((item) => ({
      number: item.number,
      fullName: fullNameFromRepositoryUrl(item.repository_url),
    }))
    .filter(
      (candidate): candidate is { number: number; fullName: string } =>
        candidate.fullName !== null,
    );

  const details = await Promise.all(
    candidates.map(async (candidate) => {
      const response = await fetch(
        `${apiBase}/repos/${candidate.fullName}/pulls/${candidate.number}`,
        { headers: githubHeaders(token) },
      );
      if (!response.ok) return null;
      return (await response.json()) as PullRequestDetail;
    }),
  );

  const items = details
    .filter((pr): pr is PullRequestDetail => pr !== null)
    .filter((pr) => pr.head.ref.startsWith(NEODEVEX_BRANCH_PREFIX))
    .map(toNeodevexPullRequest);

  return {
    items,
    next_page_id: hasNextPage(searchResponse) ? String(page + 1) : null,
  };
}

async function handleBranches(
  apiBase: string,
  token: string,
  fullName: string,
  page: number,
  query: string | undefined,
) {
  const params = new URLSearchParams({ per_page: "100", page: String(page) });
  const response = await fetch(
    `${apiBase}/repos/${fullName}/branches?${params}`,
    { headers: githubHeaders(token) },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`GitHub /branches failed (${response.status}): ${body}`);
    throw new Error(`GitHub API error (${response.status})`);
  }
  const branches = (await response.json()) as Record<string, unknown>[];
  const filtered = query
    ? branches.filter((branch) =>
        (branch.name as string).toLowerCase().includes(query.toLowerCase()),
      )
    : branches;

  return {
    items: filtered.map(toBranch),
    next_page_id: hasNextPage(response) ? String(page + 1) : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getCallerUserId(req);
  if (!userId) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const connection = await getDecryptedConnection(admin, userId);
  if (!connection) {
    return jsonResponse({ error: "not_connected" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;
  const page = Number.parseInt(body.pageId, 10) || 1;
  const apiBase = githubApiBaseUrl(connection.host);

  try {
    if (action === "repos" || action === "search") {
      const result = await handleRepos(
        apiBase,
        connection.token,
        page,
        body.query,
      );
      return jsonResponse(result);
    }
    if (action === "list_prs") {
      const result = await handlePulls(apiBase, connection.token, page);
      return jsonResponse(result);
    }
    if (action === "branches") {
      if (!body.repository) {
        return jsonResponse({ error: "missing_repository" }, { status: 400 });
      }
      const result = await handleBranches(
        apiBase,
        connection.token,
        body.repository,
        page,
        body.query,
      );
      return jsonResponse(result);
    }
    return jsonResponse({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "github_api_error" },
      { status: 502 },
    );
  }
});
