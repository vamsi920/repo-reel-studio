import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readRecords,
  resetWorkspaceMemoryStorage,
} from "#/api/workspace-memory/workspace-memory-store.api";
import { resetMirrorQueue } from "#/api/workspace-memory/workspace-memory-mirror";
import { BRAIN_MAP_FILE } from "#/lib/neo-brain/brain-map";
import { runObservation, userMessageText } from "#/lib/neo-brain/observe";
import { RecoveryTracker } from "#/lib/neo-brain/run-learnings";
import {
  computeWorkspaceId,
  drainMemoryUpdater,
  resetMemoryUpdater,
  WorkspaceContextService,
} from "#/lib/workspace-memory";
import {
  approvePending,
  buildStartBrainContext,
  consolidateWorkspace,
  dismissPending,
  exportBrainMap,
  ingestUserMessage,
  learn,
  listPending,
} from "#/services/neo-brain";
import { useNeoBrainStore } from "#/stores/neo-brain-store";

// The only fake: the agent-server's shell. Commands run for real, in a temp
// git checkout standing in for the conversation's workspace.
const runtime = vi.hoisted(() => ({ cwd: "" }));
vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: {
    executeCommand: vi.fn(
      async (_url: string, _key: string, command: string) => {
        try {
          const stdout = execSync(command, {
            cwd: runtime.cwd,
            shell: "/bin/bash",
            stdio: "pipe",
          }).toString();
          return { exit_code: 0, stdout, stderr: "" };
        } catch (error) {
          return { exit_code: 1, stdout: "", stderr: String(error) };
        }
      },
    ),
  },
}));

const SHOP = computeWorkspaceId("backend-1", "/work/shop")!;
const OTHER = computeWorkspaceId("backend-1", "/work/other")!;
let clock = Date.parse("2026-11-20T09:00:00.000Z");

function at(): string {
  clock += 60_000;
  return new Date(clock).toISOString();
}

function userEvent(text: string) {
  return {
    id: `u-${clock}`,
    timestamp: at(),
    source: "user",
    llm_message: { role: "user", content: [{ type: "text", text }] },
  };
}

function terminalEvent(command: string, exitCode: number, output = "") {
  return {
    id: `t-${clock}`,
    timestamp: at(),
    source: "environment",
    observation: {
      kind: "TerminalObservation",
      command,
      exit_code: exitCode,
      content: [{ type: "text", text: output }],
    },
  };
}

/** Exactly what `useNeoBrain` does with each event of a conversation. */
function replayConversation(
  workspaceId: string,
  conversationId: string,
  events: unknown[],
) {
  const tracker = new RecoveryTracker({ workspaceId, conversationId });
  events.forEach((event) => {
    const text = userMessageText(event);
    if (text) {
      ingestUserMessage(text, { workspaceId, conversationId });
      return;
    }
    const run = runObservation(event);
    const recovery = run ? tracker.observe(run) : null;
    if (recovery) learn(workspaceId, [recovery], conversationId);
  });
  drainMemoryUpdater();
}

function contextFor(workspaceId: string, task: string): string {
  return WorkspaceContextService.buildContext({
    workspaceId,
    task,
    conversationId: "next",
    tokenBudget: 2000,
  }).text;
}

function statements(workspaceId: string): string[] {
  return readRecords(workspaceId)
    .filter((record) => record.status !== "superseded")
    .map((record) => record.statement);
}

beforeEach(() => {
  resetWorkspaceMemoryStorage();
  resetMirrorQueue();
  resetMemoryUpdater();
  WorkspaceContextService.resetCache();
  useNeoBrainStore.getState().reset();
  runtime.cwd = mkdtempSync(join(tmpdir(), "neo-brain-ws-"));
  execSync("git init -q", { cwd: runtime.cwd });
});

afterEach(() => {
  rmSync(runtime.cwd, { recursive: true, force: true });
});

describe("Neo Brain end to end", () => {
  it("learns from one conversation and the next conversation starts with it", () => {
    replayConversation(SHOP, "conv-1", [
      userEvent("Please add a coupon field to checkout."),
      terminalEvent(
        "npm test",
        1,
        "npm ERR! This project is configured to use pnpm",
      ),
      terminalEvent("pnpm test", 0, "42 passed"),
      userEvent("Use pnpm, not npm. Never push directly to main."),
    ]);

    expect(statements(SHOP)).toEqual(
      expect.arrayContaining([
        "`npm test` fails in this workspace; use `pnpm test` to test.",
        "Use pnpm instead of npm.",
        "Never push directly to main.",
      ]),
    );

    const nextTurn = contextFor(
      SHOP,
      "run the npm tests and push the fix to main",
    );
    expect(nextTurn).toContain("pnpm");
    expect(nextTurn).toContain("Never push directly to main");
  });

  it("keeps every project's brain to itself", () => {
    replayConversation(SHOP, "conv-1", [userEvent("Use pnpm, not npm.")]);

    expect(statements(OTHER)).toEqual([]);
    expect(contextFor(OTHER, "run the npm tests")).toBe("");
  });

  it("gets more certain as the same rule comes up in more conversations", () => {
    ["conv-1", "conv-2", "conv-3"].forEach((conversation) =>
      replayConversation(SHOP, conversation, [userEvent("Use pnpm, not npm.")]),
    );

    const report = consolidateWorkspace(SHOP, { force: true });

    const [rule] = readRecords(SHOP);
    expect(readRecords(SHOP)).toHaveLength(1);
    expect(report).toMatchObject({ ran: true, reinforced: 1, pinned: 1 });
    expect(rule.pinned).toBe(true);
    expect(rule.tags).toContain("reinforced");
    // Pinned rules are always in context, even for an unrelated task.
    expect(contextFor(SHOP, "rename the header component")).toContain(
      "Use pnpm instead of npm",
    );
  });

  it("only uses an inferred correction after a person approves it", () => {
    replayConversation(SHOP, "conv-1", [
      userEvent("No, the payments service lives in services/billing."),
      userEvent("Actually, the admin app is deployed from apps/admin."),
    ]);
    const pending = listPending(SHOP);
    const billing = pending.find((item) => item.evidence.includes("billing"))!;
    const admin = pending.find((item) => item.evidence.includes("admin"))!;

    expect(statements(SHOP)).toEqual([]);

    approvePending(SHOP, billing.id);
    dismissPending(SHOP, admin.id);
    replayConversation(SHOP, "conv-2", [
      userEvent("Actually, the admin app is deployed from apps/admin."),
    ]);

    expect(statements(SHOP)).toEqual([
      "The payments service lives in services/billing.",
    ]);
    expect(readRecords(SHOP)[0].provenance.source).toBe("user-decision");
    expect(listPending(SHOP)).toEqual([]);
  });

  it("writes BRAIN.md into the workspace and rewrites it only when it changed", async () => {
    replayConversation(SHOP, "conv-1", [
      userEvent("Never push directly to main."),
    ]);
    const runtimeContext = {
      conversationUrl: "http://agent",
      sessionApiKey: "k",
      workingDir: runtime.cwd,
    };

    const options = { projectName: "acme/shop" };

    const first = await exportBrainMap(SHOP, runtimeContext, options);
    const unchanged = await exportBrainMap(SHOP, runtimeContext, options);
    replayConversation(SHOP, "conv-2", [userEvent("Use pnpm, not npm.")]);
    const changed = await exportBrainMap(SHOP, runtimeContext, options);

    const map = readFileSync(join(runtime.cwd, BRAIN_MAP_FILE), "utf-8");
    expect([first.written, unchanged.written, changed.written]).toEqual([
      true,
      false,
      true,
    ]);
    expect(map).toContain("# Project brain: acme/shop");
    expect(map).toContain("## Gates (never without explicit approval)");
    expect(map).toContain("- Never push directly to main.");
    expect(map).toContain("- Use pnpm instead of npm.");
  });

  it("gives a brand-new conversation the project's gates whatever it is asked", () => {
    replayConversation(SHOP, "conv-1", [
      userEvent("Never push directly to main."),
    ]);

    const start = buildStartBrainContext({
      workspaceId: SHOP,
      task: "rename the header component",
    });

    expect(start).toContain("Never push directly to main");
    expect(buildStartBrainContext({ workspaceId: OTHER, task: "x" })).toBe("");
  });
});
