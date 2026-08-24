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
  if (!connection) return null;

  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) return null;

  const { data: token } = await admin.rpc("decrypt_github_token", {
    ciphertext: connection.encrypted_access_token,
    encryption_key: encryptionKey,
  });
  if (!token) return null;

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
