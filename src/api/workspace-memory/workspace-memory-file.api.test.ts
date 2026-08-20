/**
 * Record statements are agent-derived text. They reach a shell. These tests
 * exist so that stays safe no matter what an agent writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { makeRecord } from "#/lib/workspace-memory/test-fixtures";

import {
  appendRecordsToWorkspace,
  buildAppendCommand,
  loadRecordsFromWorkspace,
  MEMORY_FILE,
} from "./workspace-memory-file.api";

const CONTEXT = {
  conversationUrl: "http://localhost:18000",
  sessionApiKey: "key",
  workingDir: "/w/a",
};

const HOSTILE = "'; rm -rf / #";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("buildAppendCommand", () => {
  it("never puts record content into the command", () => {
    const record = makeRecord({
      subject: "hostile",
      statement: `Deploy step: ${HOSTILE} and then restart.`,
    });

    const command = buildAppendCommand([record]);

    expect(command).not.toContain(HOSTILE);
    expect(command).not.toContain("rm -rf");
    // The only free-form text in the command is base64.
    const payload = command.match(/printf '%s' '([^']*)'/)?.[1];
    expect(payload).toBeTruthy();
    expect(payload).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("round-trips the record through the base64 payload", () => {
    const record = makeRecord({
      subject: "hostile",
      statement: `Deploy step: ${HOSTILE} and then restart.`,
    });
    const payload = buildAppendCommand([record]).match(
      /printf '%s' '([^']*)'/,
    )?.[1] as string;

    const decoded = Buffer.from(payload, "base64").toString("utf-8").trim();
    expect(JSON.parse(decoded).statement).toContain(HOSTILE);
  });

  it("appends rather than truncating", () => {
    const command = buildAppendCommand([
      makeRecord({ subject: "s", statement: "A perfectly ordinary fact." }),
    ]);
    expect(command).toContain(`>> ${MEMORY_FILE}`);
    expect(command).not.toMatch(/[^>]> [^>]*records\.jsonl/);
  });

  it("handles non-latin1 content without throwing", () => {
    const command = buildAppendCommand([
      makeRecord({
        subject: "s",
        statement: "The service is named 決済 (payments).",
      }),
    ]);
    const payload = command.match(/printf '%s' '([^']*)'/)?.[1] as string;
    expect(Buffer.from(payload, "base64").toString("utf-8")).toContain("決済");
  });
});

describe("appendRecordsToWorkspace", () => {
  it("reports failure instead of throwing on a non-zero exit code", async () => {
    vi.spyOn(AgentServerRuntimeService, "executeCommand").mockResolvedValue({
      exit_code: 1,
      stdout: "",
      stderr: "no such file or directory",
    });

    const result = await appendRecordsToWorkspace(CONTEXT, [
      makeRecord({ subject: "s", statement: "A perfectly ordinary fact." }),
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("no such file or directory");
  });

  it("swallows a thrown transport error", async () => {
    vi.spyOn(AgentServerRuntimeService, "executeCommand").mockRejectedValue(
      new Error("runtime is not ready"),
    );

    const result = await appendRecordsToWorkspace(CONTEXT, [
      makeRecord({ subject: "s", statement: "A perfectly ordinary fact." }),
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("runtime is not ready");
  });

  it("does not run a command for an empty batch", async () => {
    const spy = vi.spyOn(AgentServerRuntimeService, "executeCommand");
    await appendRecordsToWorkspace(CONTEXT, []);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("loadRecordsFromWorkspace", () => {
  const workspaceId = "ws_test";

  function record(
    id: string,
    overrides: Partial<{ workspaceId: string }> = {},
  ) {
    return {
      ...makeRecord({
        subject: id,
        statement: `Fact number ${id} is recorded.`,
      }),
      id,
      workspaceId,
      ...overrides,
    };
  }

  it("skips malformed lines rather than failing the whole load", async () => {
    const good = record("a");
    vi.spyOn(AgentServerRuntimeService, "executeCommand").mockResolvedValue({
      exit_code: 0,
      stdout: `${JSON.stringify(good)}\n{"truncated":\n\n`,
      stderr: "",
    });

    const loaded = await loadRecordsFromWorkspace(CONTEXT, workspaceId);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("a");
  });

  it("lets a later line win for the same id", async () => {
    const first = record("a");
    const second = { ...record("a"), statement: "The corrected fact." };
    vi.spyOn(AgentServerRuntimeService, "executeCommand").mockResolvedValue({
      exit_code: 0,
      stdout: `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
      stderr: "",
    });

    const loaded = await loadRecordsFromWorkspace(CONTEXT, workspaceId);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].statement).toBe("The corrected fact.");
  });

  it("drops records claiming a different workspace", async () => {
    const foreign = record("a", { workspaceId: "ws_other" });
    vi.spyOn(AgentServerRuntimeService, "executeCommand").mockResolvedValue({
      exit_code: 0,
      stdout: `${JSON.stringify(foreign)}\n`,
      stderr: "",
    });

    expect(await loadRecordsFromWorkspace(CONTEXT, workspaceId)).toEqual([]);
  });

  it("returns nothing when the file is missing", async () => {
    vi.spyOn(AgentServerRuntimeService, "executeCommand").mockResolvedValue({
      exit_code: 1,
      stdout: "",
      stderr: "",
    });
    expect(await loadRecordsFromWorkspace(CONTEXT, workspaceId)).toEqual([]);
  });
});
