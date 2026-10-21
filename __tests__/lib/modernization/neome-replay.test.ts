// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// The harness Neo ME installs into project workspaces.
import { replay, replayManaged } from "#/lib/modernization/neome-replay.mjs";

/** A tiny app: login sets a cookie, /me needs it, /items/:id echoes JSON. */
function app(variant: { dateFormat: "date" | "datetime"; slug: string }) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const loggedIn = (req.headers.cookie ?? "").includes("session=ok");
    if (req.method === "POST" && url.pathname === "/login") {
      res.writeHead(302, {
        Location: "/me",
        "Set-Cookie": "session=ok; Path=/",
        "Content-Type": variant.slug === "a" ? "text/html" : "text/plain",
      });
      res.end(variant.slug === "a" ? "<p>Redirecting...</p>" : "Found");
      return;
    }
    if (url.pathname === "/me") {
      if (!loggedIn) {
        res.writeHead(302, { Location: "/login" });
        res.end();
        return;
      }
      const when =
        variant.dateFormat === "date" ? "2026-10-21" : "2026-10-21 15:38";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<h1>Hello &amp; welcome</h1><p>posted on ${when}</p><form><input name="title"></form>`,
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/items") {
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          item: {
            slug: `thing-${variant.slug}`,
            createdAt: new Date().toISOString(),
          },
        }),
      );
      return;
    }
    if (url.pathname.startsWith("/items/")) {
      const ok = url.pathname === `/items/thing-${variant.slug}`;
      res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(ok ? { found: true } : { error: "missing" }));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end("<h1>Not Found</h1>");
  });
}

const servers: Server[] = [];
async function start(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function scenarioFile(scenario: object): string {
  const dir = mkdtempSync(join(tmpdir(), "neome-replay-"));
  const file = join(dir, "s.json");
  writeFileSync(file, JSON.stringify(scenario));
  return file;
}

const journey = {
  name: "journey",
  legacyData: true,
  // The generated slug is legitimately random; everything else must match.
  normalize: [{ pattern: "thing-[a-z]", replace: "thing-<id>" }],
  steps: [
    { name: "anonymous me", path: "/me" },
    {
      name: "login",
      session: "u",
      method: "POST",
      path: "/login",
      form: { user: "a" },
    },
    { name: "me", session: "u", path: "/me" },
    {
      name: "create",
      method: "POST",
      path: "/items",
      json: { title: "t" },
      capture: { slug: { json: "item.slug" } },
    },
    { name: "read created", path: "/items/{{slug}}" },
    { name: "unknown", path: "/nope" },
  ],
};

describe("Neo ME replay harness", () => {
  let legacy: string;
  let twin: string;
  let drifted: string;

  beforeAll(async () => {
    legacy = await start(app({ dateFormat: "date", slug: "a" }));
    twin = await start(app({ dateFormat: "date", slug: "b" }));
    drifted = await start(app({ dateFormat: "datetime", slug: "c" }));
  });

  afterAll(() => {
    servers.forEach((s) => s.close());
  });

  it("finds two apps identical when users would see the same thing", async () => {
    // Different generated slugs, timestamps and redirect bodies are fine:
    // each app reads back its own capture, and redirect bodies are unseen.
    const report = await replay({
      legacy,
      target: twin,
      files: [scenarioFile(journey)],
    });
    expect(report.differences).toEqual([]);
    expect(report).toMatchObject({
      total: 6,
      identical: 6,
      legacyDataCases: 6,
      legacyDataIdentical: 6,
    });
  });

  it("reports visible-text drift and unreachable targets", async () => {
    const report = await replay({
      legacy,
      target: drifted,
      files: [scenarioFile(journey)],
    });
    expect(report.identical).toBe(5);
    expect(report.differences).toEqual([
      expect.objectContaining({ step: "me", field: "text" }),
    ]);

    const down = await replay({
      legacy,
      target: "http://127.0.0.1:9",
      files: [
        scenarioFile({ name: "one", steps: [{ name: "home", path: "/" }] }),
      ],
    });
    expect(down.identical).toBe(0);
    expect(down.differences[0].field).toBe("target_unreachable");
  });

  it("resets both apps before every scenario and records it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "neome-reset-"));
    const report = await replay({
      legacy,
      target: twin,
      files: [scenarioFile(journey)],
      resetLegacy: `touch ${join(dir, "legacy")}`,
      resetTarget: `touch ${join(dir, "target")}`,
    });
    expect(existsSync(join(dir, "legacy"))).toBe(true);
    expect(existsSync(join(dir, "target"))).toBe(true);
    expect(report.freshData).toBe(true);
  });

  it("starts both apps on the same fixture for every scenario and stops them", async () => {
    const root = mkdtempSync(join(tmpdir(), "neome-managed-"));
    // A server that renders its data file and appends to it on POST, so a
    // scenario that leaked data into the next one would show it.
    writeFileSync(
      join(root, "server.mjs"),
      `import { createServer } from "node:http";
import { readFileSync, appendFileSync } from "node:fs";
const store = process.env.STORE;
createServer((req, res) => {
  if (req.method === "POST") appendFileSync(store, "+");
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<p>" + readFileSync(store, "utf8") + "</p>");
}).listen(Number(process.env.PORT), "127.0.0.1");`,
    );
    writeFileSync(join(root, "fixture.txt"), "seed");
    const side = (port: number, store: string) => ({
      start: `node server.mjs`,
      url: `http://127.0.0.1:${port}`,
      store,
      env: { STORE: join(root, store) },
    });
    const scenario = {
      name: "writes",
      steps: [
        { name: "add", method: "POST", path: "/" },
        { name: "read", path: "/" },
      ],
    };
    const report = await replayManaged({
      root,
      apps: {
        fixture: "fixture.txt",
        legacy: side(5941, "legacy.txt"),
        target: side(5942, "target.txt"),
      },
      // Twice: the second run must start from "seed" again, not "seed+".
      files: [scenarioFile(scenario), scenarioFile(scenario)],
    });
    expect(report).toMatchObject({
      total: 4,
      identical: 4,
      freshData: true,
      managedApps: true,
    });
    await expect(fetch("http://127.0.0.1:5941")).rejects.toThrow();
  });
});
