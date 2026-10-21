// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// The harness Neo ME installs into project workspaces.
import {
  characterize,
  compareStores,
  reaLane,
  replay,
  replayManaged,
  stripResponseHeaderNames,
} from "#/lib/modernization/neome-replay.mjs";
import { execFileSync } from "node:child_process";

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

  it("rejects guessed formats with errors that say how to fix them", async () => {
    await expect(
      replayManaged({
        apps: {
          legacy: { command: "x", url: "http://127.0.0.1:1" },
          new: {},
        },
        files: [scenarioFile(journey)],
      }),
    ).rejects.toThrow(/unknown key "new".*\n.*unknown key "command"/s);
    await expect(
      replay({
        legacy,
        target: twin,
        files: [scenarioFile([{ path: "/" }])],
      }),
    ).rejects.toThrow(/not a list/);
  });

  it("characterizes the legacy app against itself on fresh data", async () => {
    const root = mkdtempSync(join(tmpdir(), "neome-char-"));
    writeFileSync(
      join(root, "server.mjs"),
      `import { createServer } from "node:http";
let n = 0;
createServer((req, res) => {
  n += 1;
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(req.url === "/counter" ? "<p>" + n + "</p>" : "<p>hi</p>");
}).listen(Number(process.env.PORT), "127.0.0.1");`,
    );
    const report = await characterize({
      root,
      apps: {
        legacy: { start: "node server.mjs", url: "http://127.0.0.1:5943" },
      },
      files: [
        scenarioFile({
          name: "counter",
          steps: [
            { name: "one", path: "/counter" },
            { name: "two", path: "/counter" },
          ],
        }),
      ],
    });
    // A restart per run makes the in-memory counter repeat exactly.
    expect(report).toMatchObject({
      kind: "characterize",
      total: 2,
      identical: 2,
      freshData: true,
    });
  });

  it("loads the Synth rows into both SQLite stores and compares what the apps wrote", async () => {
    const root = mkdtempSync(join(tmpdir(), "neome-store-"));
    // A SQLite fixture with one table; each app inserts a row on POST and
    // lists the table on GET. The target has one extra column of its own.
    execFileSync("sqlite3", [join(root, "fixture.sqlite")], {
      input:
        "create table note (id integer primary key, body text, password text);",
    });
    writeFileSync(
      join(root, "synth.sql"),
      "insert into note (id, body, password) values (1, 'from synth', 'h1');\n",
    );
    writeFileSync(
      join(root, "server.mjs"),
      `import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
const store = process.env.STORE;
const q = (sql) => execFileSync("sqlite3", ["-json", store, sql], { encoding: "utf8" });
createServer((req, res) => {
  if (req.method === "POST") {
    q("insert into note (body, password) values ('posted', '" + process.env.HASH + "')");
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(q("select id, body from note order by id") || "[]");
}).listen(Number(process.env.PORT), "127.0.0.1");`,
    );
    const side = (port: number, store: string, hash: string) => ({
      start: "node server.mjs",
      url: `http://127.0.0.1:${port}`,
      store,
      env: { STORE: join(root, store), HASH: hash },
    });
    const scenario = {
      name: "write then read",
      synthData: true,
      steps: [
        { name: "read synth", path: "/" },
        { name: "add", method: "POST", path: "/" },
        { name: "read", path: "/" },
      ],
    };
    const report = await replayManaged({
      root,
      apps: {
        fixture: "fixture.sqlite",
        synth: { sql: "synth.sql" },
        legacy: side(5951, "legacy.sqlite", "scrypt$a"),
        target: side(5952, "target.sqlite", "pbkdf2$b"),
      },
      files: [scenarioFile(scenario)],
    });
    expect(report).toMatchObject({
      total: 3,
      identical: 3,
      synthApplied: true,
      synthDataCases: 3,
      store: { applicable: true, compared: 1, identical: 1, differences: [] },
    });

    // Secret-like columns are compared for presence only; a real row
    // difference is reported with samples from each side.
    const diff = compareStores(
      { note: { columns: ["id", "body"], rows: [{ id: 1, body: "a" }] } },
      {
        note: { columns: ["id", "body"], rows: [{ id: 1, body: "b" }] },
        extra: { columns: ["x"], rows: [] },
      },
      { norm: (v: string) => v },
    );
    expect(diff).toMatchObject({ compared: 1, identical: 0 });
    expect(diff.differences[0]).toMatchObject({
      table: "note",
      legacyRows: 1,
      targetRows: 1,
    });
  });

  it("drives REA against both apps on the same port and keeps its verdict", async () => {
    const root = mkdtempSync(join(tmpdir(), "neome-rea-"));
    mkdirSync(join(root, "parity/browser"), { recursive: true });
    // A stand-in for the REA CLI: records which origin each capture used and
    // answers compare-web-captures from the DOM hashes it was handed.
    writeFileSync(
      join(root, "fake-rea.mjs"),
      `import { readFileSync, appendFileSync } from "node:fs";
const [cmd, a, b] = process.argv.slice(2);
if (cmd === "capture-browser-scenario") {
  const input = JSON.parse(readFileSync(a, "utf8"));
  appendFileSync(process.env.REA_LOG, input.start_url.url + " " + input.browser.executable_path + "\\n");
  const html = await (await fetch(input.start_url.url)).text();
  console.log(JSON.stringify({ evidence_id: "ev_" + Math.random().toString(16).slice(2),
    normalized_result: { completeness: { status: "complete" }, dom: html,
      events: { items: [{ kind: "response", header_names: ["server", "x-powered-by"] }] } } }));
} else if (cmd === "compare-web-captures") {
  const x = JSON.parse(readFileSync(a, "utf8")), y = JSON.parse(readFileSync(b, "utf8"));
  const same = x.dom === y.dom && JSON.stringify(x.events) === JSON.stringify(y.events);
  console.log(JSON.stringify({ evidence_id: "ev_cmp", normalized_result: {
    overall_status: same ? "unchanged" : "changed", alignment: { status: "aligned", failures: [] },
    steps: [{ step_id: "home", artifact_diffs: same ? [] : [{ artifact: "dom", status: "changed", reason: null }] }] } }));
}`,
    );
    writeFileSync(
      join(root, "server.mjs"),
      `import { createServer } from "node:http";
createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h1>" + process.env.BANNER + "</h1>");
}).listen(Number(process.env.PORT), "127.0.0.1");`,
    );
    writeFileSync(
      join(root, "parity/browser/home.json"),
      JSON.stringify({
        name: "home",
        start_url: { url: "{{BASE}}/" },
        actions: [
          {
            step_id: "home",
            action: "goto",
            destination: { url: "{{BASE}}/" },
            wait_until: "load",
          },
        ],
      }),
    );
    const log = join(root, "rea.log");
    process.env.REA_LOG = log;
    const side = (port: number, banner: string) => ({
      start: "node server.mjs",
      url: `http://127.0.0.1:${port}`,
      env: { BANNER: banner },
    });
    const apps = (banner: string) => ({
      rea: {
        executable_path: "/usr/bin/true",
        command: `node ${join(root, "fake-rea.mjs")}`,
      },
      legacy: side(5961, "hello"),
      target: side(5962, banner),
    });
    const same = await reaLane({
      root,
      apps: apps("hello"),
      files: [join(root, "parity/browser/home.json")],
    });
    expect(same).toMatchObject({ kind: "rea", scenarios: 1, unchanged: 1 });
    expect(same.results[0].evidence.compare).toBe("ev_cmp");
    // Both captures hit the legacy port: REA refuses to compare origins.
    const lines = readFileSync(log, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(
      lines.every((l) => l.startsWith("http://127.0.0.1:5961/ /usr/bin/true")),
    ).toBe(true);
    expect(existsSync(join(root, ".neome/rea/home-target.evidence.json"))).toBe(
      true,
    );

    const drift = await reaLane({
      root,
      apps: apps("changed"),
      files: [join(root, "parity/browser/home.json")],
    });
    expect(drift).toMatchObject({ unchanged: 0 });
    expect(drift.results[0].changed).toEqual([
      { step: "home", artifact: "dom", status: "changed", reason: null },
    ]);

    // Response header names are the only thing the harness takes out.
    const stripped = stripResponseHeaderNames({
      events: {
        items: [
          { kind: "response", header_names: ["server"] },
          { kind: "request", header_names: ["accept"] },
        ],
      },
    });
    expect(
      stripped.events.items.map(
        (i: { header_names: string[] }) => i.header_names,
      ),
    ).toEqual([[], ["accept"]]);
  });

  it("refuses to start an app on a port something else already answers on", async () => {
    const root = mkdtempSync(join(tmpdir(), "neome-port-"));
    writeFileSync(join(root, "server.mjs"), "setInterval(() => {}, 1000);");
    // `legacy` (already running from beforeAll) owns its port.
    const report = await replayManaged({
      root,
      apps: {
        legacy: { start: "node server.mjs", url: legacy },
        target: { start: "node server.mjs", url: twin },
      },
      files: [
        scenarioFile({ name: "one", steps: [{ name: "home", path: "/" }] }),
      ],
    });
    expect(report.identical).toBe(0);
    expect(String(report.differences[0].legacy)).toMatch(
      /already answers.*another process owns port/,
    );
  });

  it("rejects an REA opt-out for an app served over HTTP", async () => {
    await expect(
      replayManaged({
        apps: {
          rea: { not_applicable: "JSON API" },
          legacy: { start: "x", url: "http://127.0.0.1:1" },
          target: { start: "x", url: "http://127.0.0.1:2" },
        },
        files: [scenarioFile(journey)],
      }),
    ).rejects.toThrow(/only for apps with no HTTP surface/);
  });
});
