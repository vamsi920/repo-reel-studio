import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  CONNECTION_CACHE_KEYS,
  invalidateConnectionCaches,
} from "#/lib/environment/invalidate-connection-caches";
import { isLocalGithubConnected } from "#/api/git-service/github-connection-flag";

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: () => ({ backend: { kind: "local", id: "local" } }),
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("invalidateConnectionCaches", () => {
  it("covers every cache a connection is visible through", async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const refetch = vi.spyOn(client, "refetchQueries");

    await invalidateConnectionCaches(client);

    const touched = [
      ...refetch.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey)),
      ...invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey)),
    ];
    // Asserted against the exported list so a key dropped from the helper
    // fails here rather than surfacing later as "one screen is stale".
    for (const key of CONNECTION_CACHE_KEYS) {
      expect(touched).toContain(JSON.stringify(key));
    }
  });

  it("settles the connection query before invalidating repositories", async () => {
    // Ordering is load-bearing: `GitService` returns an EMPTY page (not an
    // error) while the module-level flag is false, so refetching repositories
    // first would cache that empty page for the whole staleTime.
    const client = makeClient();
    const order: string[] = [];
    vi.spyOn(client, "refetchQueries").mockImplementation(async (filters) => {
      order.push(`refetch:${JSON.stringify(filters?.queryKey)}`);
    });
    vi.spyOn(client, "invalidateQueries").mockImplementation(
      async (filters) => {
        order.push(`invalidate:${JSON.stringify(filters?.queryKey)}`);
      },
    );

    await invalidateConnectionCaches(client);

    expect(order[0]).toBe('refetch:["github-connection"]');
    expect(order.indexOf('invalidate:["repositories"]')).toBeGreaterThan(0);
  });

  it("corrects the module-level flag from the refetched connection", async () => {
    // The flag's only other writer is an effect inside `useUserProviders`,
    // which is not guaranteed to be mounted when a connection is made.
    const client = makeClient();
    client.setQueryData(["github-connection"], { githubUsername: "octocat" });
    vi.spyOn(client, "refetchQueries").mockResolvedValue(undefined);

    await invalidateConnectionCaches(client);
    expect(isLocalGithubConnected()).toBe(true);

    client.setQueryData(["github-connection"], null);
    await invalidateConnectionCaches(client);
    expect(isLocalGithubConnected()).toBe(false);
  });
});
