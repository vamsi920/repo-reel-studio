import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const connectionsMock = vi.hoisted(() => vi.fn());
const startGithubOAuth = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const assign = vi.hoisted(() => vi.fn());

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => connectionsMock(),
}));
vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({ currentPath: "/conversations", navigate }),
}));
vi.mock("#/services/github-reconnect", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  startGithubOAuth: (...args: unknown[]) => startGithubOAuth(...args),
}));

const { useGithubSelfHeal } = await import("#/hooks/use-github-self-heal");

function github(status: string) {
  return {
    id: "c1",
    providerId: "github",
    status,
    config: {},
    lastProbe: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  startGithubOAuth.mockResolvedValue({ authorizeUrl: "https://github.com/x" });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, search: "" },
  });
});

describe("useGithubSelfHeal", () => {
  it("re-authorizes GitHub by itself when the stored token was rejected", async () => {
    connectionsMock.mockReturnValue({ data: [github("revoked")] });

    renderHook(() => useGithubSelfHeal());

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://github.com/x"),
    );
    expect(startGithubOAuth).toHaveBeenCalledWith({
      enterpriseHost: null,
      returnTo: "/conversations",
    });
  });

  it("does not try again within the cooldown, so a real problem cannot loop", async () => {
    connectionsMock.mockReturnValue({ data: [github("revoked")] });
    renderHook(() => useGithubSelfHeal());
    await waitFor(() => expect(startGithubOAuth).toHaveBeenCalledTimes(1));

    renderHook(() => useGithubSelfHeal());
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(startGithubOAuth).toHaveBeenCalledTimes(1);
  });

  it("leaves a working connection alone", async () => {
    connectionsMock.mockReturnValue({ data: [github("ok")] });

    renderHook(() => useGithubSelfHeal());
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(startGithubOAuth).not.toHaveBeenCalled();
  });
});
