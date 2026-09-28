import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueryChain {
  calls: Array<[string, unknown[]]>;
  select: (...args: unknown[]) => QueryChain;
  gte: (...args: unknown[]) => QueryChain;
  order: (...args: unknown[]) => QueryChain;
  eq: (...args: unknown[]) => QueryChain;
  lte: (...args: unknown[]) => QueryChain;
  then: (
    resolve: (value: {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    }) => void,
    reject: (reason: unknown) => void,
  ) => Promise<unknown>;
}

const state = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  data: null as Record<string, unknown>[] | null,
  error: null as { message: string } | null,
}));

function createQueryChain(): QueryChain {
  const chain = {
    calls: [] as Array<[string, unknown[]]>,
  } as QueryChain;
  for (const name of ["select", "gte", "order", "eq", "lte"] as const) {
    chain[name] = (...args: unknown[]) => {
      chain.calls.push([name, args]);
      return chain;
    };
  }
  chain.then = (resolve, reject) =>
    Promise.resolve({ data: state.data, error: state.error }).then(
      resolve,
      reject,
    );
  return chain;
}

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.isSupabaseConfigured;
  },
  supabase: {
    from: () => createQueryChain(),
  },
}));

const { agentOpsRepository } = await import(
  "#/lib/data-platform/repositories/agentops-repository"
);

describe("agentOpsRepository.queryHistoricalRuns", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.data = null;
    state.error = null;
  });

  it("returns [] without querying when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;
    await expect(
      agentOpsRepository.queryHistoricalRuns({ since: "2026-09-01" }),
    ).resolves.toEqual([]);
  });

  it("returns [] when the query errors", async () => {
    state.error = { message: "permission denied for table agentops_runs" };
    await expect(
      agentOpsRepository.queryHistoricalRuns({ since: "2026-09-01" }),
    ).resolves.toEqual([]);
  });

  it("prefers the joined workspaces.path over the raw hashed workspace_id column", async () => {
    state.data = [
      {
        run_id: "run-1",
        workspace_id: "a1b2c3d4e5f6",
        agent_name: "openhands",
        status: "finished",
        cost_usd: 0.42,
        updated_at: "2026-09-27T10:00:00Z",
        workspaces: { path: "/home/user/repo-reel-studio" },
      },
    ];

    await expect(
      agentOpsRepository.queryHistoricalRuns({ since: "2026-09-01" }),
    ).resolves.toEqual([
      {
        runId: "run-1",
        workspaceId: "/home/user/repo-reel-studio",
        agentName: "openhands",
        status: "finished",
        costUsd: 0.42,
        updatedAt: "2026-09-27T10:00:00Z",
      },
    ]);
  });

  it("falls back to the raw workspace_id when no workspaces row is joined", async () => {
    state.data = [
      {
        run_id: "run-2",
        workspace_id: "a1b2c3d4e5f6",
        agent_name: null,
        status: null,
        cost_usd: null,
        updated_at: "2026-09-27T11:00:00Z",
        workspaces: null,
      },
    ];

    await expect(
      agentOpsRepository.queryHistoricalRuns({ since: "2026-09-01" }),
    ).resolves.toEqual([
      {
        runId: "run-2",
        workspaceId: "a1b2c3d4e5f6",
        agentName: null,
        status: null,
        costUsd: 0,
        updatedAt: "2026-09-27T11:00:00Z",
      },
    ]);
  });
});
