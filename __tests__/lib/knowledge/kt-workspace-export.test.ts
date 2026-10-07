import { beforeEach, describe, expect, it, vi } from "vitest";
import { KT_KNOWLEDGE, KT_SNAPSHOT } from "./kt-fixtures";

const executeCommand = vi.fn();
vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: {
    executeCommand: (...args: unknown[]) => executeCommand(...args),
  },
}));

const {
  buildKtFiles,
  buildPrepareCommand,
  buildWriteFileCommands,
  exportKtToWorkspace,
  ktPageFileName,
} = await import("#/lib/knowledge/kt-workspace-export");

function decodeWrite(command: string): string {
  const match = command.match(/printf '%s' '([^']*)'/);
  return Buffer.from(match?.[1] ?? "", "base64").toString("utf-8");
}

describe("buildKtFiles", () => {
  it("writes an index, one file per page, and meta", () => {
    const files = buildKtFiles(KT_KNOWLEDGE, KT_SNAPSHOT);

    expect(files.map((file) => file.path)).toEqual([
      ".neodevex/kt/INDEX.md",
      ".neodevex/kt/pages/payments-flow.md",
      ".neodevex/kt/pages/checkout.md",
      ".neodevex/kt/meta.json",
    ]);
    const index = files[0].content;
    expect(index).toContain("Commit: abc1234def");
    expect(index).toContain("[Payments Flow](pages/payments-flow.md)");
    expect(index).toContain("src/payments/capture.ts:10-40");
    expect(index).toContain("trust the code");
    const page = files[1].content;
    expect(page).toContain("```mermaid");
    expect(page).toContain("[Checkout](checkout.md)");
    expect(JSON.parse(files[3].content)).toMatchObject({
      commitSha: "abc1234def",
      pageCount: 2,
    });
  });

  it("writes under a custom root and names the commit the docs describe", () => {
    const files = buildKtFiles(KT_KNOWLEDGE, KT_SNAPSHOT, {
      rootDir: "docs/kt",
    });

    expect(files[0].path).toBe("docs/kt/INDEX.md");
    expect(files[0].content).toContain("git diff --stat abc1234def..HEAD");
  });

  it("sanitizes page ids into safe file names", () => {
    expect(ktPageFileName("../../etc/passwd")).toBe("etc-passwd.md");
  });
});

describe("shell safety", () => {
  it("never puts page content into a command, only base64", () => {
    const [, page] = buildKtFiles(KT_KNOWLEDGE, KT_SNAPSHOT);
    const commands = buildWriteFileCommands(page);

    expect(commands.join("\n")).not.toContain("$(rm -rf /)");
    expect(commands.map(decodeWrite).join("")).toBe(page.content);
  });

  it("splits large files into ordered chunks that reassemble exactly", () => {
    const content = "x".repeat(200_000);
    const commands = buildWriteFileCommands({ path: "a.md", content });

    expect(commands.length).toBeGreaterThan(1);
    expect(commands[0]).toContain("> a.md");
    expect(commands[1]).toContain(">> a.md");
    expect(commands.map(decodeWrite).join("")).toBe(content);
  });

  it("excludes .neodevex/ from git idempotently, only in a git checkout", () => {
    const command = buildPrepareCommand();

    expect(command.startsWith("test -e .git && ")).toBe(true);
    expect(command).toContain("grep -qxF '.neodevex/' .git/info/exclude");
  });
});

describe("exportKtToWorkspace", () => {
  beforeEach(() => {
    executeCommand.mockReset();
  });

  it("runs every command in the workspace and reports success", async () => {
    executeCommand.mockResolvedValue({ exit_code: 0, stdout: "", stderr: "" });

    const result = await exportKtToWorkspace(
      { conversationUrl: "http://rt", sessionApiKey: "k", workingDir: "/w" },
      KT_KNOWLEDGE,
      KT_SNAPSHOT,
    );

    expect(result).toEqual({ ok: true });
    expect(executeCommand).toHaveBeenCalledTimes(5);
    expect(executeCommand.mock.calls[0][3]).toBe("/w");
  });

  it("stops and reports the error when a write fails", async () => {
    executeCommand.mockResolvedValue({ exit_code: 1, stderr: "disk full" });

    const result = await exportKtToWorkspace(
      { conversationUrl: "http://rt", sessionApiKey: "k", workingDir: "/w" },
      KT_KNOWLEDGE,
      KT_SNAPSHOT,
    );

    expect(result).toEqual({ ok: false, error: "disk full" });
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });
});
