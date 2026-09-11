import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  invokeError: null as { context?: Response } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  supabase: {
    functions: {
      invoke: async () => ({
        data: null,
        error: state.invokeError,
      }),
    },
  },
}));

const { getLocalGithubRepositoryBranches, GithubProxyError } = await import(
  "#/api/git-service/local-github-service.api"
);

function proxyErrorResponse(body: unknown, status = 502) {
  return new Response(JSON.stringify(body), { status });
}

describe("local github proxy error messages", () => {
  beforeEach(() => {
    state.invokeError = null;
  });

  it("maps github_auth_error to an actionable reconnect message", async () => {
    state.invokeError = {
      context: proxyErrorResponse({ error: "github_auth_error" }, 401),
    };

    await expect(
      getLocalGithubRepositoryBranches({ repository: "user/repo" }),
    ).rejects.toThrow(
      "Your GitHub connection isn't working. Reconnect it in Settings > Connections.",
    );
  });

  it("maps github_api_error to a generic retry message", async () => {
    state.invokeError = {
      context: proxyErrorResponse({ error: "github_api_error" }, 502),
    };

    await expect(
      getLocalGithubRepositoryBranches({ repository: "user/repo" }),
    ).rejects.toThrow("GitHub is temporarily unreachable. Please try again.");
  });

  it("falls back to the raw error code for an unrecognized error", async () => {
    state.invokeError = {
      context: proxyErrorResponse({ error: "some_new_code" }, 500),
    };

    await expect(
      getLocalGithubRepositoryBranches({ repository: "user/repo" }),
    ).rejects.toThrow("some_new_code");
  });

  it("throws a GithubProxyError instance", async () => {
    state.invokeError = {
      context: proxyErrorResponse({ error: "github_auth_error" }, 401),
    };

    await expect(
      getLocalGithubRepositoryBranches({ repository: "user/repo" }),
    ).rejects.toBeInstanceOf(GithubProxyError);
  });
});
