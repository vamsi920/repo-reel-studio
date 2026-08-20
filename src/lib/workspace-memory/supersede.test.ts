import { describe, expect, it } from "vitest";

import { applyTemporalSupersede } from "./supersede";
import { makeRecord } from "./test-fixtures";

const REST_2025 = {
  subject: "payments:transport",
  statement: "Payments uses REST.",
  provenance: {
    source: "user-decision" as const,
    conversationId: "conv-2025",
    observedAt: "2025-03-01T00:00:00.000Z",
  },
};

const GRPC_2026 = {
  subject: "payments:transport",
  statement: "Payments moved to gRPC.",
  provenance: {
    source: "user-decision" as const,
    conversationId: "conv-2026",
    observedAt: "2026-03-01T00:00:00.000Z",
  },
};

describe("applyTemporalSupersede", () => {
  it("lets the newer fact win while keeping the old one traceable", () => {
    const old = makeRecord(REST_2025);
    const incoming = makeRecord(GRPC_2026);

    const result = applyTemporalSupersede([old], incoming);

    expect(result.supersededIds).toEqual([old.id]);
    const stored = result.records.find((record) => record.id === old.id);
    expect(stored?.status).toBe("superseded");
    expect(stored?.supersededById).toBe(incoming.id);
    expect(stored?.supersededAt).toBe("2026-03-01T00:00:00.000Z");
    // The old record is kept, never deleted.
    expect(result.records).toHaveLength(2);
    expect(
      result.records.find((record) => record.id === incoming.id)?.status,
    ).toBe("active");
  });

  it("supersedes the arriving record when it is the stale one", () => {
    const current = makeRecord(GRPC_2026);
    const late = makeRecord(REST_2025);

    const result = applyTemporalSupersede([current], late);

    expect(result.supersededIds).toEqual([late.id]);
    expect(result.records.find((r) => r.id === late.id)?.status).toBe(
      "superseded",
    );
    expect(result.records.find((r) => r.id === current.id)?.status).toBe(
      "active",
    );
  });

  it("marks both sides conflicted when grounded sources disagree concurrently", () => {
    const a = makeRecord({
      subject: "payments:transport",
      statement: "Payments uses REST.",
      provenance: {
        source: "repository-evidence",
        conversationId: "conv-a",
        observedAt: "2026-03-01T12:00:00.000Z",
        filePath: "services/payments/README.md",
        commitSha: "aaa1111",
      },
    });
    const b = makeRecord({
      subject: "payments:transport",
      statement: "Payments uses gRPC.",
      provenance: {
        source: "repository-evidence",
        conversationId: "conv-b",
        observedAt: "2026-03-01T12:01:00.000Z",
        filePath: "services/payments/proto/payments.proto",
        commitSha: "aaa1111",
      },
    });

    const result = applyTemporalSupersede([a], b);

    expect(result.conflictedIds).toContain(a.id);
    expect(result.conflictedIds).toContain(b.id);
    expect(result.supersededIds).toHaveLength(0);
    result.records.forEach((record) => {
      expect(record.status).toBe("conflicted");
    });
    expect(result.records.find((r) => r.id === a.id)?.conflictsWith).toContain(
      b.id,
    );
    expect(result.records.find((r) => r.id === b.id)?.conflictsWith).toContain(
      a.id,
    );
  });

  it("lets an authoritative source break a concurrent tie", () => {
    const evidence = makeRecord({
      subject: "payments:transport",
      statement: "Payments uses REST.",
      provenance: {
        source: "repository-evidence",
        conversationId: "conv-a",
        observedAt: "2026-03-01T12:00:00.000Z",
        filePath: "docs/payments.md",
        commitSha: "aaa1111",
      },
    });
    const decision = makeRecord({
      subject: "payments:transport",
      statement: "Payments moved to gRPC.",
      provenance: {
        source: "user-decision",
        conversationId: "conv-b",
        observedAt: "2026-03-01T12:00:30.000Z",
      },
    });

    const result = applyTemporalSupersede([evidence], decision);

    expect(result.conflictedIds).toHaveLength(0);
    expect(result.supersededIds).toEqual([evidence.id]);
  });

  it("leaves unrelated subjects alone", () => {
    const other = makeRecord({
      subject: "build:test-command",
      statement: "The test command is npm test.",
    });
    const incoming = makeRecord(GRPC_2026);

    const result = applyTemporalSupersede([other], incoming);

    expect(result.supersededIds).toHaveLength(0);
    expect(result.conflictedIds).toHaveLength(0);
    expect(result.records.find((r) => r.id === other.id)?.status).toBe(
      "active",
    );
  });
});
