// @vitest-environment node
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BRAIN_MAP_FILE,
  buildBrainMapCommands,
  mapFingerprint,
  renderBrainMap,
} from "#/lib/neo-brain/brain-map";
import { consolidate, STALE_AFTER_DAYS } from "#/lib/neo-brain/consolidate";
import { learningKey } from "#/lib/neo-brain/learning-key";
import { detectRecoveries } from "#/lib/neo-brain/run-learnings";
import { makeRecord } from "#/lib/workspace-memory/test-fixtures";

const RUN = { workspaceId: "ws_a", conversationId: "conv-1" };

describe("run recoveries", () => {
  it("learns the working command after a tooling failure", () => {
    const [learning] = detectRecoveries(
      [
        {
          command: "npm test",
          exitCode: 1,
          output: "npm ERR! This project is configured to use pnpm",
        },
        { command: "cd web && pnpm test", exitCode: 0, eventId: "e9" },
      ],
      RUN,
    );
    expect(learning.layer).toBe("failure");
    expect(learning.candidate.statement).toBe(
      "`npm test` fails in this workspace; use `pnpm test` to test.",
    );
    expect(learning.candidate.provenance.source).toBe("verified-agent-result");
  });

  it("learns node's own runner after npm reports a missing script", () => {
    const [learning] = detectRecoveries(
      [
        {
          command: "npm test",
          exitCode: 1,
          output: 'npm error Missing script: "test"',
        },
        { command: "node --test", exitCode: 0 },
      ],
      RUN,
    );
    expect(learning.candidate.statement).toBe(
      "`npm test` fails in this workspace; use `node --test` to test.",
    );
  });

  it("learns nothing when the code was broken and then fixed", () => {
    expect(
      detectRecoveries(
        [
          { command: "npm test", exitCode: 1, output: "1 failed, 20 passed" },
          { command: "npx vitest run src/a.test.ts", exitCode: 0 },
        ],
        RUN,
      ),
    ).toEqual([]);
  });

  it("learns nothing when the same command simply passed on retry", () => {
    expect(
      detectRecoveries(
        [
          { command: "pnpm test", exitCode: 127, output: "" },
          { command: "pnpm test", exitCode: 0 },
        ],
        RUN,
      ),
    ).toEqual([]);
  });
});

describe("consolidation", () => {
  const NOW = new Date("2026-11-24T12:00:00.000Z");

  it("reinforces a learning heard in two conversations and pins it at three", () => {
    const record = makeRecord({
      kind: "convention",
      subject: "prefer:npm~pnpm",
      statement: "Use pnpm instead of npm.",
      confidence: 0.9,
    });
    const key = learningKey(record.kind, record.subject, record.statement);
    const sighting = (conversations: string[]) => ({
      [key]: {
        conversations,
        firstSeen: "2026-11-01T00:00:00.000Z",
        lastSeen: "2026-11-20T00:00:00.000Z",
      },
    });

    const twice = consolidate([record], sighting(["c1", "c2"]), NOW);
    expect(twice.records[0].confidence).toBeGreaterThan(record.confidence);
    expect(twice.records[0].tags).toContain("reinforced");
    expect(twice.records[0].pinned).toBe(false);

    const thrice = consolidate([record], sighting(["c1", "c2", "c3"]), NOW);
    expect(thrice.records[0].pinned).toBe(true);
  });

  it("marks an unconfirmed run-derived learning stale and keeps user rules", () => {
    const old = new Date(
      NOW.getTime() - (STALE_AFTER_DAYS + 1) * 86_400_000,
    ).toISOString();
    const runLearning = makeRecord({
      kind: "procedure",
      subject: "command:make test",
      statement: "`make test` runs successfully in this workspace.",
      provenance: {
        source: "verified-agent-result",
        conversationId: "c1",
        observedAt: old,
      },
    });
    const userRule = makeRecord({
      kind: "policy",
      subject: "policy:lint",
      statement: "Always run lint before committing.",
      provenance: {
        source: "user-decision",
        conversationId: "c1",
        observedAt: old,
      },
    });

    const report = consolidate([runLearning, userRule], {}, NOW);

    expect(report.decayed).toEqual([runLearning.id]);
    expect(report.records[0].tags).toContain("stale");
    expect(report.records[0].confidence).toBeLessThan(runLearning.confidence);
    expect(report.records[1]).toEqual(userRule);
  });
});

describe("BRAIN.md", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  const records = [
    makeRecord({
      kind: "constraint",
      subject: "gate:push-main",
      statement: "Never push directly to main.",
    }),
    makeRecord({
      kind: "convention",
      subject: "prefer:npm~pnpm",
      statement: "Use pnpm instead of npm. It's `pnpm` 'quoted' $(rm -rf /).",
    }),
  ];

  it("groups learnings by layer under the read-first rules", () => {
    const map = renderBrainMap({
      records,
      pendingReview: 1,
      generatedAt: "2026-11-24T12:00:00.000Z",
      projectName: "acme/shop",
    });
    expect(map).toContain("# Project brain: acme/shop");
    expect(map).toContain("## Read this first");
    expect(map.indexOf("## Gates")).toBeLessThan(map.indexOf("## Conventions"));
    expect(map).toContain("- Never push directly to main.");
    expect(map).toContain("1 more learning(s) are waiting");
  });

  it("ignores the timestamp when deciding whether the map changed", () => {
    const render = (generatedAt: string) =>
      renderBrainMap({ records, pendingReview: 0, generatedAt });
    expect(mapFingerprint(render("2026-11-24T12:00:00.000Z"))).toBe(
      mapFingerprint(render("2026-11-25T08:30:00.000Z")),
    );
  });

  it("writes the map into a real git checkout and keeps it out of git", () => {
    dir = mkdtempSync(join(tmpdir(), "neo-brain-"));
    execSync("git init -q", { cwd: dir });
    const content = renderBrainMap({
      records,
      pendingReview: 0,
      generatedAt: "2026-11-24T12:00:00.000Z",
    });

    buildBrainMapCommands(content).forEach((command) => {
      execSync(command, { cwd: dir!, shell: "/bin/bash" });
    });

    expect(readFileSync(join(dir, BRAIN_MAP_FILE), "utf-8")).toBe(content);
    expect(readFileSync(join(dir, ".git/info/exclude"), "utf-8")).toContain(
      ".neodevex/",
    );
    expect(execSync("git status --porcelain", { cwd: dir }).toString()).toBe(
      "",
    );
  });

  it("refuses to write before the folder is a git checkout", () => {
    dir = mkdtempSync(join(tmpdir(), "neo-brain-"));
    const [prepare] = buildBrainMapCommands("# x\n");
    expect(() =>
      execSync(prepare, { cwd: dir!, shell: "/bin/bash", stdio: "ignore" }),
    ).toThrow();
  });
});
