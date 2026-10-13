// @vitest-environment node
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CI_SOURCE,
  createBridge,
  freshItems,
  repoSlug,
  sign,
  watchedRepos,
} from "../../scripts/github-event-bridge.mjs";
import { withDeliveryContract } from "../../scripts/automation-delivery-contract.mjs";

const REPO = {
  id: 1,
  name: "app",
  full_name: "acme/app",
  default_branch: "main",
  owner: { login: "acme" },
};
const USER = { login: "dev", id: 7 };

describe("github event bridge helpers", () => {
  it("only watches repos of enabled GitHub-triggered automations", () => {
    const repos = watchedRepos([
      {
        enabled: true,
        org_id: "o1",
        trigger: { type: "event", source: "github" },
        preset_metadata: { repos: [{ url: "https://github.com/acme/app" }] },
      },
      {
        enabled: false,
        org_id: "o1",
        trigger: { type: "event", source: "github" },
        preset_metadata: { repos: [{ url: "https://github.com/acme/off" }] },
      },
      {
        enabled: true,
        org_id: "o1",
        trigger: { type: "cron" },
        preset_metadata: { repos: [{ url: "https://github.com/acme/cron" }] },
      },
    ]);

    expect([...repos]).toEqual([["acme/app", "o1"]]);
    expect(repoSlug("git@github.com:acme/app.git")).toBe("acme/app");
    expect(repoSlug("https://gitlab.com/acme/app")).toBeNull();
  });

  it("returns only items newer than the cursor that were not already sent", () => {
    const items = [
      { id: 1, created_at: "2026-10-08T10:00:00Z" },
      { id: 2, created_at: "2026-10-08T12:00:00Z" },
      { id: 3, created_at: "2026-10-08T12:05:00Z" },
    ];

    const fresh = freshItems(items, "2026-10-08T11:00:00Z", new Set(["3"]));

    expect(fresh.map((i) => i.id)).toEqual([2]);
  });

  it("signs the exact body the way GitHub does", () => {
    const body = '{"payload":{}}';
    const expected = createHmac("sha256", "s3cret").update(body).digest("hex");

    expect(sign(body, "s3cret")).toBe(`sha256=${expected}`);
  });
});

describe("github event bridge tick", () => {
  function fakeFetch(
    github: Record<string, unknown>,
    posts: { url: string; body: string; headers: Record<string, string> }[],
  ) {
    return async (
      url: string,
      init: {
        method?: string;
        body?: string;
        headers?: Record<string, string>;
      } = {},
    ) => {
      const reply = (status: number, data: unknown) => ({
        ok: status < 400,
        status,
        text: async () =>
          typeof data === "string" ? data : JSON.stringify(data),
      });
      if (url.includes("/runs?")) return reply(200, { runs: [] });
      if (init.method === "PATCH") return reply(200, {});
      if (url.includes("/api/automation/v1?")) {
        return reply(200, {
          automations: [
            {
              id: "auto-1",
              enabled: true,
              org_id: "org-1",
              trigger: {
                type: "event",
                source: "github",
                on: "issue_comment.created",
              },
              preset_metadata: {
                repos: [{ url: "https://github.com/acme/app" }],
              },
            },
          ],
        });
      }
      if (url.endsWith("/api/settings/secrets/GITHUB_TOKEN"))
        return reply(200, "gho_test");
      if (url === "https://api.github.com/user") {
        const auth = init.headers?.Authorization ?? "";
        return auth.endsWith("expired") ? reply(401, {}) : reply(200, USER);
      }
      if (url.includes("/v1/events/")) {
        posts.push({ url, body: init.body ?? "", headers: init.headers ?? {} });
        return reply(200, { matched: 1 });
      }
      const path = url
        .replace("https://api.github.com/repos/acme/app", "")
        .split("?")[0];
      if (path in github) return reply(200, github[path]);
      return reply(404, { message: `unexpected ${url}` });
    };
  }

  it("forwards a new issue comment as a signed github event, once", async () => {
    const posts: {
      url: string;
      body: string;
      headers: Record<string, string>;
    }[] = [];
    const state = join(mkdtempSync(join(tmpdir(), "bridge-")), "state.json");
    const comment = {
      id: 99,
      created_at: "2099-01-01T00:00:00Z",
      body: "/bench",
      user: USER,
      issue_url: "https://api.github.com/repos/acme/app/issues/5",
    };
    const github = {
      "": REPO,
      "/issues": [],
      "/issues/comments": [comment],
      "/issues/5": { number: 5, title: "Bug", user: USER },
      "/pulls": [],
      "/branches/main": { commit: { sha: "abc" } },
      "/actions/runs": { workflow_runs: [] },
    };
    const env = {
      AUTOMATION_URL: "http://auto",
      AGENT_SERVER_URL: "http://agent",
      SESSION_API_KEY: "k",
      AUTOMATION_WEBHOOK_SECRET: "whsec",
      GITHUB_BRIDGE_STATE: state,
      HOME: tmpdir(),
    };
    const quiet = { log: () => {}, error: () => {} };
    const bridge = createBridge(
      env,
      fakeFetch(github, posts) as typeof fetch,
      quiet,
    );
    bridge.state.repos["acme/app"] = {
      since: "2026-01-01T00:00:00Z",
      seen: [],
      head: "abc",
    };

    await bridge.tick();
    await bridge.tick();

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(
      "http://auto/api/automation/v1/events/org-1/github",
    );
    const body = JSON.parse(posts[0].body);
    expect(body.payload).toMatchObject({
      action: "created",
      comment: { id: 99 },
      issue: { number: 5 },
      repository: { full_name: "acme/app" },
    });
    expect(posts[0].headers["X-Hub-Signature-256"]).toBe(
      sign(posts[0].body, "whsec"),
    );
  });

  // GitHub serves lists from a cache for up to 60 s; an issue first seen by
  // a poll that ran after the cursor passed its timestamp was never sent.
  it("still forwards an item that appears after the cursor passed it", async () => {
    const posts: {
      url: string;
      body: string;
      headers: Record<string, string>;
    }[] = [];
    const now = Date.now();
    const lateComment = {
      id: 42,
      created_at: new Date(now - 2 * 60 * 1000).toISOString(),
      user: USER,
      issue_url: "https://api.github.com/repos/acme/app/issues/5",
    };
    const github = {
      "": REPO,
      "/issues": [],
      "/issues/comments": [lateComment],
      "/issues/5": { number: 5, user: USER },
      "/pulls": [],
      "/branches/main": { commit: { sha: "abc" } },
      "/actions/runs": { workflow_runs: [] },
    };
    const bridge = createBridge(
      {
        AUTOMATION_URL: "http://auto",
        AGENT_SERVER_URL: "http://agent",
        SESSION_API_KEY: "k",
        AUTOMATION_WEBHOOK_SECRET: "whsec",
        GITHUB_BRIDGE_STATE: join(
          mkdtempSync(join(tmpdir(), "bridge-")),
          "s.json",
        ),
        HOME: tmpdir(),
      },
      fakeFetch(github, posts) as typeof fetch,
      { log: () => {}, error: () => {} },
    );
    bridge.state.repos["acme/app"] = {
      since: new Date(now - 30 * 1000).toISOString(),
      seen: [],
      head: "abc",
    };

    await bridge.tick();

    expect(posts).toHaveLength(1);
  });

  it("skips a credential GitHub rejects and uses the next one", async () => {
    const posts: {
      url: string;
      body: string;
      headers: Record<string, string>;
    }[] = [];
    const logs: string[] = [];
    const errors: string[] = [];
    const comment = {
      id: 1,
      created_at: "2099-01-01T00:00:00Z",
      user: USER,
      issue_url: "https://api.github.com/repos/acme/app/issues/5",
    };
    const github = {
      "": REPO,
      "/issues": [],
      "/issues/comments": [comment],
      "/issues/5": { number: 5, user: USER },
      "/pulls": [],
      "/branches/main": { commit: { sha: "abc" } },
      "/actions/runs": { workflow_runs: [] },
    };
    const bridge = createBridge(
      {
        AUTOMATION_URL: "http://auto",
        AGENT_SERVER_URL: "http://agent",
        SESSION_API_KEY: "k",
        AUTOMATION_WEBHOOK_SECRET: "whsec",
        GITHUB_TOKEN: "gho_expired",
        GITHUB_BRIDGE_STATE: join(
          mkdtempSync(join(tmpdir(), "bridge-")),
          "s.json",
        ),
        HOME: tmpdir(),
      },
      fakeFetch(github, posts) as typeof fetch,
      {
        log: (m: string) => logs.push(m),
        error: (m: string) => errors.push(m),
      },
    );
    bridge.state.repos["acme/app"] = {
      since: "2026-01-01T00:00:00Z",
      seen: [],
      head: "abc",
    };

    await bridge.tick();

    expect(
      errors.some((m) => m.includes("rejected the credential from env")),
    ).toBe(true);
    expect(
      logs.some((m) => m.includes("credentials from app connection")),
    ).toBe(true);
    expect(posts).toHaveLength(1);
  });

  it("does nothing without the webhook secret", async () => {
    const posts: {
      url: string;
      body: string;
      headers: Record<string, string>;
    }[] = [];
    const errors: string[] = [];
    const bridge = createBridge(
      {
        HOME: tmpdir(),
        GITHUB_BRIDGE_STATE: join(
          mkdtempSync(join(tmpdir(), "bridge-")),
          "s.json",
        ),
      },
      fakeFetch({}, posts) as typeof fetch,
      { log: () => {}, error: (m: string) => errors.push(m) },
    );

    await bridge.tick();

    expect(posts).toHaveLength(0);
    expect(errors.join("\n")).toContain("AUTOMATION_WEBHOOK_SECRET");
    expect(CI_SOURCE).toBe("github-ci");
  });
});

describe("github event bridge delivery contract backfill", () => {
  it("adds the contract to an automation created outside the app, once", async () => {
    const patches: { url: string; body: string }[] = [];
    let prompt = "Every weekday, triage new issues.";
    const reply = (data: unknown) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(data),
    });
    const fetchImpl = async (
      url: string,
      init: { method?: string; body?: string } = {},
    ) => {
      if (init.method === "PATCH") {
        patches.push({ url, body: init.body ?? "" });
        prompt = JSON.parse(init.body ?? "{}").prompt;
        return reply({});
      }
      if (url.includes("/runs?")) return reply({ runs: [] });
      return reply({
        automations: [
          { id: "a1", name: "Triage", enabled: true, prompt, trigger: {} },
        ],
      });
    };
    const bridge = createBridge(
      {
        HOME: tmpdir(),
        GITHUB_BRIDGE_STATE: join(
          mkdtempSync(join(tmpdir(), "bridge-")),
          "s.json",
        ),
      },
      fetchImpl as unknown as typeof fetch,
      { log: () => {}, error: () => {} },
    );

    await bridge.tick();
    await bridge.tick();

    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe("http://127.0.0.1:18001/api/automation/v1/a1");
    expect(JSON.parse(patches[0].body).prompt).toBe(
      withDeliveryContract("Every weekday, triage new issues."),
    );
  });
});

describe("github event bridge conditional polling", () => {
  it("revalidates GitHub reads with ETags so unchanged polls cost no rate limit", async () => {
    const conditional: string[] = [];
    const json = (status: number, data: unknown, etag?: string) => ({
      ok: status < 400,
      status,
      headers: new Headers(etag ? { etag } : {}),
      text: async () => (status === 304 ? "" : JSON.stringify(data)),
    });
    const fetchImpl = async (
      url: string,
      init: { method?: string; headers?: Record<string, string> } = {},
    ) => {
      if (url.includes("/api/automation/v1/") && url.includes("/runs?"))
        return json(200, { runs: [] });
      if (url.includes("/api/automation/v1?"))
        return json(200, {
          automations: [
            {
              id: "a1",
              enabled: true,
              org_id: "o1",
              trigger: {
                type: "event",
                source: "github",
                filter: "repository.full_name == 'acme/app'",
              },
              preset_metadata: {
                repos: [{ url: "https://github.com/acme/app" }],
              },
            },
          ],
        });
      if (url === "https://api.github.com/user") return json(200, USER);
      if (url.startsWith("https://api.github.com/")) {
        const tag = init.headers?.["If-None-Match"];
        if (tag) {
          conditional.push(url);
          return json(304, null);
        }
        const path = url
          .replace("https://api.github.com/repos/acme/app", "")
          .split("?")[0];
        const bodies: Record<string, unknown> = {
          "": REPO,
          "/issues": [],
          "/issues/comments": [],
          "/pulls": [],
          "/branches/main": { commit: { sha: "abc" } },
          "/actions/runs": { workflow_runs: [] },
        };
        return json(200, bodies[path], `"${path}-v1"`);
      }
      return json(200, {});
    };
    const bridge = createBridge(
      {
        AUTOMATION_WEBHOOK_SECRET: "s",
        GITHUB_TOKEN: "gho_ok",
        HOME: tmpdir(),
        GITHUB_BRIDGE_STATE: join(
          mkdtempSync(join(tmpdir(), "bridge-")),
          "s.json",
        ),
      },
      fetchImpl as unknown as typeof fetch,
      { log: () => {}, error: () => {} },
    );

    await bridge.tick();
    await bridge.tick();

    // Every GitHub read on the second tick is conditional and answered 304.
    expect(conditional).toHaveLength(6);
    expect(conditional.every((u) => !u.includes("since="))).toBe(true);
  });
});
