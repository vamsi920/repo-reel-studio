import { describe, expect, it } from "vitest";

import { candidate, makeRecord } from "./test-fixtures";
import { evaluateWrite, MAX_STATEMENT_CHARS } from "./write-gate";

describe("evaluateWrite", () => {
  it("accepts an explicit user decision", () => {
    const verdict = evaluateWrite(
      candidate({
        subject: "payments:transport",
        statement: "Payments moved to gRPC.",
        provenance: {
          source: "user-decision",
          conversationId: "conv-1",
          observedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      [],
    );
    expect(verdict.accepted).toBe(true);
    expect(verdict.record?.provenance.grounded).toBe(true);
    expect(verdict.record?.status).toBe("active");
    expect(verdict.record?.tokenCost).toBeGreaterThan(0);
  });

  it("rejects a bare agent claim with nothing to check it against", () => {
    const verdict = evaluateWrite(
      candidate({
        subject: "payments:transport",
        statement: "Payments uses gRPC everywhere.",
        provenance: {
          source: "agent-claim",
          conversationId: "conv-1",
          observedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      [],
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe("ungrounded-agent-claim");
  });

  it("rejects repository evidence with no anchor", () => {
    const verdict = evaluateWrite(
      candidate({
        subject: "build:test-command",
        statement: "The test command is npm test.",
        provenance: {
          source: "repository-evidence",
          conversationId: "conv-1",
          observedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      [],
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe("missing-repository-anchor");
  });

  it("accepts repository evidence anchored to a file at a commit", () => {
    const verdict = evaluateWrite(
      candidate({
        subject: "build:test-command",
        statement: "The test command is npm test.",
        provenance: {
          source: "repository-evidence",
          conversationId: "conv-1",
          observedAt: "2026-01-01T00:00:00.000Z",
          filePath: "package.json",
          commitSha: "abc1234",
        },
      }),
      [],
    );
    expect(verdict.accepted).toBe(true);
  });

  it("refuses anything anchored to a sensitive path", () => {
    const verdict = evaluateWrite(
      candidate({
        subject: "env:database-url",
        statement: "DATABASE_URL points at the staging cluster.",
        provenance: {
          source: "repository-evidence",
          conversationId: "conv-1",
          observedAt: "2026-01-01T00:00:00.000Z",
          filePath: ".env",
          commitSha: "abc1234",
        },
      }),
      [],
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe("sensitive-path");
  });

  it("refuses deliberation, keeping only conclusions", () => {
    const verdict = evaluateWrite(
      candidate({
        subject: "payments:transport",
        statement:
          "I think payments probably uses gRPC, let's check the proto files.",
      }),
      [],
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe("reasoning-not-outcome");
  });

  it("rejects duplicates of an active record", () => {
    const existing = makeRecord({
      subject: "payments:transport",
      statement: "Payments moved to gRPC.",
    });
    const verdict = evaluateWrite(
      candidate({
        subject: "Payments:Transport",
        statement: "  Payments moved to   gRPC.  ",
      }),
      [existing],
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe("duplicate");
  });

  it("bounds statement length in both directions", () => {
    expect(
      evaluateWrite(candidate({ subject: "s", statement: "short" }), []).reason,
    ).toBe("too-short");
    expect(
      evaluateWrite(
        candidate({
          subject: "s",
          statement: "x".repeat(MAX_STATEMENT_CHARS + 1),
        }),
        [],
      ).reason,
    ).toBe("too-long");
  });

  it("refuses to write without a workspace id", () => {
    const verdict = evaluateWrite(
      candidate({
        workspaceId: "",
        subject: "s",
        statement: "A real fact here.",
      }),
      [],
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe("missing-workspace-id");
  });
});
