// Regression for the recurring "GitHub needs to be reconnected" (2026-11-25):
// the generic reconnect flow burned GitHub token slots without saving a token.
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("#/lib/data-platform/client", () => ({
  supabase: { functions: { invoke } },
  isSupabaseConfigured: true,
}));

const { EnvironmentService } =
  await import("#/api/environment-service/environment-service.api");
const { AUTO_RECONNECT_COOLDOWN_MS, claimAutoReconnect, takeGithubReturnPath } =
  await import("#/services/github-reconnect");

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({
    data: { authorizeUrl: "https://github.com/login/oauth/authorize?x=1" },
    error: null,
  });
  localStorage.clear();
  sessionStorage.clear();
});

describe("GitHub reconnect", () => {
  it("sends every GitHub reconnect through the flow that returns a token", async () => {
    const { authorizeUrl } = await EnvironmentService.startOAuth({
      capability: "source-control" as never,
      providerId: "github",
      returnTo: "/conversations/abc",
    });

    expect(authorizeUrl).toContain("github.com/login/oauth/authorize");
    expect(invoke).toHaveBeenCalledWith("github-oauth-start", {
      body: { appOrigin: window.location.origin },
    });
    expect(invoke).not.toHaveBeenCalledWith(
      "connections-oauth-start",
      expect.anything(),
    );
    expect(takeGithubReturnPath()).toBe("/conversations/abc");
    expect(takeGithubReturnPath()).toBeNull();
  });

  it("keeps other providers on the generic flow", async () => {
    await EnvironmentService.startOAuth({
      capability: "issue-tracker" as never,
      providerId: "jira-cloud",
    });

    expect(invoke).toHaveBeenCalledWith(
      "connections-oauth-start",
      expect.objectContaining({
        body: expect.objectContaining({ providerId: "jira-cloud" }),
      }),
    );
  });

  it("re-authorizes on its own at most once per cooldown", () => {
    const now = 1_800_000_000_000;

    expect(claimAutoReconnect(now)).toBe(true);
    expect(claimAutoReconnect(now + 60_000)).toBe(false);
    expect(claimAutoReconnect(now + AUTO_RECONNECT_COOLDOWN_MS + 1)).toBe(true);
  });

  it("never returns to an off-site path", () => {
    sessionStorage.setItem(
      "neo-github-reconnect-return",
      JSON.stringify({ path: "//evil.example", at: Date.now() }),
    );
    expect(takeGithubReturnPath()).toBeNull();
  });

  it("forgets the return path when the user abandoned the GitHub page", () => {
    sessionStorage.setItem(
      "neo-github-reconnect-return",
      JSON.stringify({ path: "/rag", at: Date.now() - 11 * 60 * 1000 }),
    );
    expect(takeGithubReturnPath()).toBeNull();
  });
});
