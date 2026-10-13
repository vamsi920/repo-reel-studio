// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  alertPayload,
  createAutomationGuard,
  decide,
  windowSpend,
} from "../../scripts/automation-guard.mjs";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("decide", () => {
  it("cancels live runs and pauses once the rolling daily budget is spent, counting live cost", () => {
    const runs = [
      {
        id: "old",
        status: "COMPLETED",
        cost: 1.5,
        created_at: minutesAgo(600),
      },
      { id: "live", status: "RUNNING", cost: null, created_at: minutesAgo(5) },
    ];

    const { cancel, pause } = decide(
      { daily_budget_usd: 2 },
      runs,
      { live: 0.6 },
      NOW,
    );

    expect(cancel).toEqual([{ runId: "live", reason: "budget" }]);
    // Spend drops under the cap when the 1.50 run leaves the 24 h window.
    expect(pause).toEqual({
      reason: "budget",
      spent: 2.1,
      until: Date.parse(minutesAgo(600)) + 24 * 60 * 60 * 1000,
    });
  });

  it("never counts a run without reported cost as spend", () => {
    expect(
      windowSpend(
        [
          {
            id: "a",
            status: "COMPLETED",
            cost: null,
            created_at: minutesAgo(1),
          },
        ],
        {},
        NOW,
      ).spent,
    ).toBe(0);
  });

  it("cancels runs beyond the hourly limit and overlapping runs, ignoring cancelled ones", () => {
    const runs = [
      { id: "r1", status: "COMPLETED", created_at: minutesAgo(50) },
      { id: "r2", status: "CANCELLED", created_at: minutesAgo(40) },
      { id: "r3", status: "RUNNING", created_at: minutesAgo(30) },
      { id: "r4", status: "PENDING", created_at: minutesAgo(1) },
    ];

    expect(decide({ max_runs_per_hour: 2 }, runs, {}, NOW).cancel).toEqual([
      { runId: "r4", reason: "rate_limit" },
    ]);
    expect(
      decide({ skip_overlapping_runs: true }, runs, {}, NOW).cancel,
    ).toEqual([{ runId: "r4", reason: "overlap" }]);
  });

  it("does nothing without a policy", () => {
    expect(
      decide(undefined, [{ id: "r", status: "RUNNING" }], {}, NOW),
    ).toEqual({ cancel: [], pause: null });
  });
});

describe("alertPayload", () => {
  it.each([
    ["https://hooks.slack.com/services/x", { text: "hi" }],
    ["https://discord.com/api/webhooks/1/x", { content: "hi" }],
    ["https://example.com/hook", { text: "hi", run: { id: "r" } }],
  ])("shapes the body for %s", (url, expected) => {
    expect(alertPayload(url, "hi", { run: { id: "r" } })).toEqual(expected);
  });
});

describe("createAutomationGuard", () => {
  function setup({
    runs,
    misc = {},
    report = "Done.\nRESULT: FAILED tests still fail",
    enabled = true,
  }: {
    runs: Record<string, unknown>[];
    misc?: Record<string, unknown>;
    report?: string;
    enabled?: boolean;
  }) {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const desktop: string[] = [];
    const reply = (data: unknown, status = 200) => ({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(data),
    });
    const fetchImpl = async (
      url: string,
      init: { method?: string; body?: string } = {},
    ) => {
      const method = init.method ?? "GET";
      calls.push({
        method,
        url,
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      if (url === "http://agent/api/settings" && method === "GET")
        return reply({ misc_settings: misc });
      if (url.includes("/api/automation/v1?"))
        return reply({
          automations: [
            {
              id: "auto-1",
              name: "Nightly fix",
              enabled,
              last_triggered_at: minutesAgo(5),
            },
          ],
        });
      if (url.includes("/auto-1/runs?")) return reply({ runs });
      if (url.includes("/events/search"))
        return reply({
          items: [
            {
              kind: "MessageEvent",
              source: "agent",
              llm_message: { content: [{ type: "text", text: report }] },
            },
          ],
        });
      return reply({});
    };
    const guard = createAutomationGuard({
      automationUrl: "http://auto",
      agentUrl: "http://agent",
      key: "k",
      appUrl: "http://app",
      state: { guard: { since: minutesAgo(60), alerted: [] } },
      save: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: { log: () => {}, error: () => {} },
      now: () => NOW,
      desktop: (title: string, body: string) => {
        desktop.push(`${title} | ${body}`);
      },
      alertWebhookEnv: "",
    });
    return { guard, calls, desktop };
  }

  it("alerts once for a run that completed but reported RESULT: FAILED", async () => {
    const { guard, desktop } = setup({
      runs: [
        {
          id: "run-1",
          status: "COMPLETED",
          conversation_id: "c1",
          completed_at: minutesAgo(1),
          cost: 0.12,
        },
      ],
    });

    await guard.tick();
    await guard.tick();

    expect(desktop).toEqual([
      "Automation failed: Nightly fix | tests still fail\nhttp://app/automations/auto-1 · $0.12",
    ]);
  });

  it("posts the alert to a configured Slack webhook", async () => {
    const { guard, calls } = setup({
      misc: {
        automation_policies: {
          alerts: {
            desktop: false,
            webhook_url: "https://hooks.slack.com/services/T/B/x",
          },
        },
      },
      runs: [
        {
          id: "run-1",
          status: "FAILED",
          error_detail: "Sandbox crashed\ntraceback",
          completed_at: minutesAgo(1),
        },
      ],
    });

    await guard.tick();

    expect(calls.find((c) => c.url.includes("hooks.slack.com"))?.body).toEqual({
      text: "*Automation failed: Nightly fix*\nSandbox crashed\nhttp://app/automations/auto-1",
    });
  });

  it("does not alert for delivered runs or runs that ended before it started", async () => {
    const { guard, desktop } = setup({
      report: "RESULT: https://github.com/a/b/pull/1",
      runs: [
        {
          id: "ok",
          status: "COMPLETED",
          conversation_id: "c",
          completed_at: minutesAgo(1),
        },
        { id: "old", status: "FAILED", completed_at: minutesAgo(120) },
      ],
    });

    await guard.tick();

    expect(desktop).toEqual([]);
  });

  it("pauses an automation over budget, cancels its live run and records why", async () => {
    const { guard, calls } = setup({
      misc: {
        automation_policies: {
          alerts: { desktop: false },
          automations: { "auto-1": { daily_budget_usd: 1 } },
        },
      },
      runs: [
        {
          id: "spent",
          status: "COMPLETED",
          cost: 1.2,
          created_at: minutesAgo(30),
          completed_at: minutesAgo(20),
        },
        { id: "live", status: "RUNNING", created_at: minutesAgo(2) },
      ],
      report: "RESULT: https://github.com/a/b/pull/1",
    });

    await guard.tick();

    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST http://auto/api/automation/v1/runs/live/cancel",
      "PATCH http://auto/api/automation/v1/auto-1",
      "PATCH http://agent/api/settings",
    ]);
    expect(writes[1].body).toEqual({ enabled: false });
    expect(writes[2].body).toMatchObject({
      misc_settings_diff: {
        automation_guard: {
          paused: { "auto-1": { reason: "budget", budget_usd: 1 } },
          cancelled: { live: { reason: "budget", automation_id: "auto-1" } },
        },
      },
    });
  });

  it("turns a guard-paused automation back on once it is under budget", async () => {
    const { guard, calls } = setup({
      enabled: false,
      misc: {
        automation_policies: {
          alerts: { on: "off" },
          automations: { "auto-1": { daily_budget_usd: 5 } },
        },
        automation_guard: { paused: { "auto-1": { reason: "budget" } } },
      },
      runs: [
        { id: "r", status: "COMPLETED", cost: 1, created_at: minutesAgo(30) },
      ],
    });

    await guard.tick();

    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes[0]).toMatchObject({
      url: "http://auto/api/automation/v1/auto-1",
      body: { enabled: true },
    });
    expect(writes[1].body).toMatchObject({
      misc_settings_diff: { automation_guard: { paused: { "auto-1": null } } },
    });
  });
});
