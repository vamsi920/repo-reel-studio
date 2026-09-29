import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import {
  createRequestHandler,
  createRouter,
} from "../../scripts/agentops-server.mjs";

/**
 * The router/request-handler tests below cover `scripts/agentops-server.mjs`,
 * which previously had zero direct test coverage — every other module it
 * wires together (collector, policy, run-control, map-events, store) is unit
 * tested, but the HTTP layer that dispatches to them was not.
 */

function makeReq(
  method: string,
  {
    body,
    raw,
    headers = {},
    url = "/",
  }: {
    body?: unknown;
    /** A literal body string, for exercising malformed-JSON handling. */
    raw?: string;
    headers?: Record<string, string>;
    url?: string;
  } = {},
) {
  const payload = raw ?? (body === undefined ? "" : JSON.stringify(body));
  const req = Readable.from(
    payload ? [Buffer.from(payload)] : [],
  ) as Readable & {
    method: string;
    headers: Record<string, string>;
    url: string;
  };
  req.method = method;
  req.headers = headers;
  req.url = url;
  return req;
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      Object.assign(this.headers, headers ?? {});
    },
    end(payload?: string) {
      this.body = payload ?? "";
    },
  };
}

function json(res: ReturnType<typeof makeRes>) {
  return JSON.parse(res.body);
}

const RUN = {
  runId: "run-1",
  workspaceId: "/workspace/project",
  agentName: "agent",
  status: "running",
  task: "Do the thing",
  costUsd: 0,
};

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    listRuns: vi.fn().mockResolvedValue([RUN]),
    listApprovals: vi.fn().mockResolvedValue([]),
    getRun: vi.fn().mockResolvedValue(RUN),
    listSpans: vi.fn().mockResolvedValue([]),
    listAudit: vi.fn().mockResolvedValue([]),
    getApproval: vi.fn().mockResolvedValue(null),
    upsertApproval: vi.fn().mockResolvedValue(undefined),
    appendAudit: vi.fn().mockResolvedValue(undefined),
    getPolicies: vi.fn().mockResolvedValue({ workspaces: {}, agents: {} }),
    setPolicies: vi
      .fn()
      .mockImplementation((policies) => Promise.resolve(policies)),
    getWorkspacePolicy: vi
      .fn()
      .mockResolvedValue({ autonomyLevel: "assisted" }),
    ...overrides,
  };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    getConversation: vi
      .fn()
      .mockResolvedValue({ id: RUN.runId, execution_status: "running" }),
    interruptConversation: vi.fn().mockResolvedValue({ success: true }),
    runConversation: vi.fn().mockResolvedValue({ success: true }),
    respondToConfirmation: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

function makeCollector() {
  return { health: vi.fn().mockReturnValue({ status: "ok" }) };
}

describe("createRouter", () => {
  it("returns runs and derives Overview counts from the same store data", async () => {
    const store = makeStore();
    const client = makeClient();
    const collector = makeCollector();
    const routes = createRouter({
      store,
      client,
      collector,
      storeKind: "jsonl",
    });

    const res = makeRes();
    const url = new URL("http://localhost/summary");
    await routes(makeReq("GET"), res, "/summary", url);

    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ activeRuns: 1, store: "jsonl" });
  });

  it("forwards run-list query params to the store", async () => {
    const store = makeStore();
    const routes = createRouter({
      store,
      client: makeClient(),
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const url = new URL(
      "http://localhost/runs?status=running&workspace=/w&since=2026-01-01&limit=10",
    );
    const res = makeRes();
    await routes(makeReq("GET"), res, "/runs", url);

    expect(store.listRuns).toHaveBeenCalledWith({
      status: "running",
      workspaceId: "/w",
      since: "2026-01-01",
      limit: 10,
    });
    expect(json(res).runs).toEqual([RUN]);
  });

  it("404s a run lookup the store does not know", async () => {
    const store = makeStore({ getRun: vi.fn().mockResolvedValue(null) });
    const routes = createRouter({
      store,
      client: makeClient(),
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const res = makeRes();
    await routes(
      makeReq("GET"),
      res,
      "/runs/missing",
      new URL("http://localhost/runs/missing"),
    );

    expect(res.statusCode).toBe(404);
  });

  it("scopes a run's approvals to that run on GET /runs/:id", async () => {
    const approvals = [
      { id: "a1", runId: RUN.runId, state: "pending" },
      { id: "a2", runId: "other-run", state: "pending" },
    ];
    const store = makeStore({
      listApprovals: vi.fn().mockResolvedValue(approvals),
    });
    const routes = createRouter({
      store,
      client: makeClient(),
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const res = makeRes();
    await routes(
      makeReq("GET"),
      res,
      `/runs/${RUN.runId}`,
      new URL(`http://localhost/runs/${RUN.runId}`),
    );

    expect(res.statusCode).toBe(200);
    expect(json(res).approvals).toEqual([approvals[0]]);
  });

  it("maps a refused run control to the RunControlError's own status", async () => {
    // The runtime reports "paused"; run-control.mjs refuses Stop on a paused
    // run (see its own doc comment) rather than forwarding a no-op.
    const store = makeStore();
    const client = makeClient({
      getConversation: vi
        .fn()
        .mockResolvedValue({ id: RUN.runId, execution_status: "paused" }),
    });
    const routes = createRouter({
      store,
      client,
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const res = makeRes();
    await routes(
      makeReq("POST"),
      res,
      `/runs/${RUN.runId}/cancel`,
      new URL(`http://localhost/runs/${RUN.runId}/cancel`),
    );

    expect(res.statusCode).toBe(409);
    expect(json(res).error).toContain("paused");
    expect(client.interruptConversation).not.toHaveBeenCalled();
  });

  it("forwards a control the runtime will honour and audits it", async () => {
    const store = makeStore();
    const client = makeClient();
    const routes = createRouter({
      store,
      client,
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const res = makeRes();
    await routes(
      makeReq("POST"),
      res,
      `/runs/${RUN.runId}/pause`,
      new URL(`http://localhost/runs/${RUN.runId}/pause`),
    );

    expect(res.statusCode).toBe(200);
    expect(client.interruptConversation).toHaveBeenCalledWith(RUN.runId);
    expect(store.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "run.pause" }),
    );
  });

  it("404s an unknown approval and 409s one already decided", async () => {
    const store = makeStore();
    const routes = createRouter({
      store,
      client: makeClient(),
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const missingRes = makeRes();
    await routes(
      makeReq("POST"),
      missingRes,
      "/approvals/nope/approve",
      new URL("http://localhost/approvals/nope/approve"),
    );
    expect(missingRes.statusCode).toBe(404);

    store.getApproval.mockResolvedValue({
      id: "a1",
      kind: "confirmation",
      state: "approved",
      runId: RUN.runId,
    });
    const decidedRes = makeRes();
    await routes(
      makeReq("POST"),
      decidedRes,
      "/approvals/a1/approve",
      new URL("http://localhost/approvals/a1/approve"),
    );
    expect(decidedRes.statusCode).toBe(409);
  });

  it("answers a pending confirmation approval through the runtime", async () => {
    const approval = {
      id: "confirmation:run-1:tc1",
      kind: "confirmation",
      state: "pending",
      runId: RUN.runId,
      workspaceId: RUN.workspaceId,
      breaches: [],
    };
    const store = makeStore({
      getApproval: vi.fn().mockResolvedValue(approval),
    });
    const client = makeClient();
    const routes = createRouter({
      store,
      client,
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const res = makeRes();
    await routes(
      makeReq("POST", { body: { reason: "looks safe" } }),
      res,
      `/approvals/${approval.id}/approve`,
      new URL(`http://localhost/approvals/${approval.id}/approve`),
    );

    expect(res.statusCode).toBe(200);
    expect(client.respondToConfirmation).toHaveBeenCalledWith(RUN.runId, {
      accept: true,
      reason: "looks safe",
    });
    expect(store.upsertApproval).toHaveBeenCalledWith(
      expect.objectContaining({ state: "approved" }),
    );
  });

  it("rejects approving a budget breach with a non-positive headroom", async () => {
    const approval = {
      id: "budget:run-1:t",
      kind: "budget",
      state: "pending",
      runId: RUN.runId,
      workspaceId: RUN.workspaceId,
      breaches: [{ scope: "run", limitUsd: 5, usedUsd: 5 }],
    };
    const store = makeStore({
      getApproval: vi.fn().mockResolvedValue(approval),
    });
    const routes = createRouter({
      store,
      client: makeClient(),
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const res = makeRes();
    await routes(
      makeReq("POST", { body: { additionalBudgetUsd: -1 } }),
      res,
      `/approvals/${approval.id}/approve`,
      new URL(`http://localhost/approvals/${approval.id}/approve`),
    );

    expect(res.statusCode).toBe(400);
    expect(store.setPolicies).not.toHaveBeenCalled();
  });

  it("raises the breached policy and resumes the run on a valid budget approval", async () => {
    const approval = {
      id: "budget:run-1:t",
      kind: "budget",
      state: "pending",
      runId: RUN.runId,
      workspaceId: RUN.workspaceId,
      breaches: [{ scope: "workspace", limitUsd: 5, usedUsd: 5.2 }],
    };
    const store = makeStore({
      getApproval: vi.fn().mockResolvedValue(approval),
    });
    // The collector halts a run with `/interrupt` (leaving it "paused")
    // before ever raising a budget approval for it — resume is only ok
    // against that halted state, not a still-"running" one.
    const client = makeClient({
      getConversation: vi
        .fn()
        .mockResolvedValue({ id: RUN.runId, execution_status: "paused" }),
    });
    const routes = createRouter({
      store,
      client,
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const res = makeRes();
    await routes(
      makeReq("POST", { body: { additionalBudgetUsd: 10 } }),
      res,
      `/approvals/${approval.id}/approve`,
      new URL(`http://localhost/approvals/${approval.id}/approve`),
    );

    expect(res.statusCode).toBe(200);
    expect(store.setPolicies).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: expect.objectContaining({
          [RUN.workspaceId]: expect.objectContaining({
            monthlyBudgetUsd: 15.2,
          }),
        }),
      }),
    );
    expect(client.runConversation).toHaveBeenCalledWith(RUN.runId);
    expect(json(res)).toMatchObject({ ok: true, resumed: true });
  });

  it("rejects a policies save whose body isn't a JSON object, without saving it", async () => {
    const store = makeStore();
    const routes = createRouter({
      store,
      client: makeClient(),
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const res = makeRes();
    await routes(
      makeReq("PUT"),
      res,
      "/policies",
      new URL("http://localhost/policies"),
    );

    expect(res.statusCode).toBe(400);
    expect(store.setPolicies).not.toHaveBeenCalled();
  });

  it("rolls up one workspace per run plus every workspace with a saved policy", async () => {
    const store = makeStore({
      listRuns: vi.fn().mockResolvedValue([RUN]),
      getPolicies: vi.fn().mockResolvedValue({
        workspaces: { "/workspace/other": { monthlyBudgetUsd: 20 } },
        agents: {},
      }),
    });
    const routes = createRouter({
      store,
      client: makeClient(),
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const res = makeRes();
    await routes(
      makeReq("GET"),
      res,
      "/budgets",
      new URL("http://localhost/budgets"),
    );

    const workspaceIds = json(res).budgets.map(
      (budget: { workspaceId: string }) => budget.workspaceId,
    );
    expect(workspaceIds.sort()).toEqual(
      ["/workspace/other", RUN.workspaceId].sort(),
    );
  });

  it("reports no route handled for an unknown path", async () => {
    const routes = createRouter({
      store: makeStore(),
      client: makeClient(),
      collector: makeCollector(),
      storeKind: "jsonl",
    });

    const handled = await routes(
      makeReq("GET"),
      makeRes(),
      "/not-a-route",
      new URL("http://localhost/not-a-route"),
    );
    expect(handled).toBe(false);
  });
});

describe("createRequestHandler", () => {
  function handlerWith(
    overrides: {
      store?: ReturnType<typeof makeStore>;
      apiKey?: string | null;
    } = {},
  ) {
    return createRequestHandler({
      store: overrides.store ?? makeStore(),
      client: makeClient(),
      collector: makeCollector(),
      storeKind: "jsonl",
      apiKey: overrides.apiKey ?? null,
    });
  }

  it("answers /health without requiring the session key", async () => {
    const handle = handlerWith({ apiKey: "secret" });
    const res = makeRes();
    await handle(makeReq("GET", { url: "/api/agentops/health" }), res);
    expect(res.statusCode).toBe(200);
    expect(json(res).status).toBe("ok");
  });

  it("401s a request missing or mismatching the configured session key", async () => {
    const handle = handlerWith({ apiKey: "secret" });
    const res = makeRes();
    await handle(
      makeReq("GET", {
        url: "/api/agentops/runs",
        headers: { "x-session-api-key": "wrong" },
      }),
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it("404s an unmatched route once authenticated", async () => {
    const handle = handlerWith();
    const res = makeRes();
    await handle(makeReq("GET", { url: "/api/agentops/nope" }), res);
    expect(res.statusCode).toBe(404);
  });

  it("maps a malformed request body to 400, not 500", async () => {
    const handle = handlerWith();
    // Not valid JSON — readBody's own rejection now carries `status: 400`.
    const req = makeReq("PUT", {
      url: "/api/agentops/policies",
      raw: "{not json",
    });
    const res = makeRes();
    await handle(req, res);
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toContain("not valid JSON");
  });

  it("falls back to 500 for an unexpected store failure", async () => {
    const store = makeStore({
      listRuns: vi.fn().mockRejectedValue(new Error("store exploded")),
    });
    const handle = handlerWith({ store });
    const res = makeRes();
    await handle(makeReq("GET", { url: "/api/agentops/summary" }), res);
    expect(res.statusCode).toBe(500);
    expect(json(res).error).toBe("store exploded");
  });
});
