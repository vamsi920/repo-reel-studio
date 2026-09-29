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
  isSupabaseConfigured: true,
}));

const { EnvironmentService, EnvironmentServiceError } = await import(
  "#/api/environment-service/environment-service.api"
);

function edgeFunctionErrorResponse(body: unknown, status = 500) {
  return new Response(JSON.stringify(body), { status });
}

describe("EnvironmentService edge function error messages", () => {
  beforeEach(() => {
    state.invokeError = null;
  });

  // Regression: an OAuth-only connector with no server-side client
  // id/secret returned `{error: "oauth_not_configured", requires: [...]}`,
  // but the SDK's hardcoded FunctionsHttpError message discarded it, so the
  // toast only ever read "Edge Function returned a non-2xx status code".
  it("surfaces oauth_not_configured plus the missing env vars", async () => {
    state.invokeError = {
      context: edgeFunctionErrorResponse({
        error: "oauth_not_configured",
        requires: ["GITLAB_OAUTH_CLIENT_ID", "GITLAB_OAUTH_CLIENT_SECRET"],
      }),
    };

    await expect(
      EnvironmentService.startOAuth({
        capability: "git" as never,
        providerId: "gitlab-com",
      }),
    ).rejects.toThrow(
      "oauth_not_configured: missing GITLAB_OAUTH_CLIENT_ID, GITLAB_OAUTH_CLIENT_SECRET",
    );
  });

  it("falls back to the bare error code when there is no requires list", async () => {
    state.invokeError = {
      context: edgeFunctionErrorResponse({ error: "not_connected" }, 404),
    };

    await expect(
      EnvironmentService.disconnect("connection-id"),
    ).rejects.toThrow("not_connected");
  });

  it("appends a field name when the body carries one instead of requires", async () => {
    state.invokeError = {
      context: edgeFunctionErrorResponse(
        { error: "unknown_field", field: "some_field" },
        400,
      ),
    };

    await expect(
      EnvironmentService.setCredentials({
        capability: "git" as never,
        providerId: "gitlab-com",
        config: {},
        credentials: {},
      }),
    ).rejects.toThrow("unknown_field: some_field");
  });

  it("falls back to the generic SDK message when the body isn't JSON", async () => {
    state.invokeError = {
      context: new Response("not json", { status: 500 }),
    };

    await expect(
      EnvironmentService.probeConnection("connection-id"),
    ).rejects.toBeInstanceOf(EnvironmentServiceError);
  });
});
