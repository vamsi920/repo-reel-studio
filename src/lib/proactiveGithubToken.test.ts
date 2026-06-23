import { describe, expect, it, vi } from "vitest";

const TEST_TOKEN = "ghp_PROACTIVE_TEST_DO_NOT_PERSIST_000000000000";

vi.mock("@/env", () => ({ API_URL: "/api" }));

describe("dispatchProactiveDaily githubToken", () => {
  it("omits githubToken from request body when not provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          config: { repoUrl: "https://github.com/o/r", enabled: true, targetCount: 6 },
          ready: 0,
          target: 6,
          candidates: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { dispatchProactiveDaily } = await import("@/lib/proactiveAgentOps");
    await dispatchProactiveDaily({
      repoUrl: "https://github.com/o/r",
      projectId: "p1",
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String((init as RequestInit)?.body ?? "{}"));
    expect(body.githubToken).toBeUndefined();
    fetchMock.mockRestore();
  });

  it("includes githubToken only when explicitly provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          config: { repoUrl: "https://github.com/o/r", enabled: true, targetCount: 6 },
          ready: 0,
          target: 6,
          candidates: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { dispatchProactiveDaily } = await import("@/lib/proactiveAgentOps");
    await dispatchProactiveDaily({
      repoUrl: "https://github.com/o/r",
      githubToken: TEST_TOKEN,
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String((init as RequestInit)?.body ?? "{}"));
    expect(body.githubToken).toBe(TEST_TOKEN);
    const serialized = JSON.stringify(body);
    expect(serialized.includes(TEST_TOKEN)).toBe(true);
    fetchMock.mockRestore();
  });
});
