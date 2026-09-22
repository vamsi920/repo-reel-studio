/**
 * Regression test: `useAgentOpsWorkspaceActivity`'s dedup `Set` used to be
 * shared across the whole time an AgentOps surface stayed mounted, with no
 * scoping by backend id — even though the audit query it reads is itself
 * scoped by backend id. Audit record ids (e.g. the JSONL store's
 * `${entityId}:${action}:${at}:${arrayIndex}`) are not guaranteed unique
 * across separate collector processes, so switching the active local backend
 * mid-session could silently drop a same-id record from the new backend's
 * workspace activity feed. The hook must reset its dedup set whenever the
 * active backend id changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAgentOpsWorkspaceActivity } from "#/hooks/use-agentops-workspace-activity";
import type { AgentOpsAuditRecord } from "#/api/agentops-service/agentops-service.types";

const { useActiveBackendMock, useAgentOpsAuditMock, publishAgentOpsActivityMock } =
  vi.hoisted(() => ({
    useActiveBackendMock: vi.fn(),
    useAgentOpsAuditMock: vi.fn(),
    publishAgentOpsActivityMock: vi.fn(),
  }));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

vi.mock("#/hooks/query/use-agentops", () => ({
  useAgentOpsAudit: () => useAgentOpsAuditMock(),
}));

vi.mock("#/lib/activity/agentops-activity", () => ({
  publishAgentOpsActivity: (
    records: AgentOpsAuditRecord[],
    published: Set<string>,
  ) => publishAgentOpsActivityMock(records, published),
}));

const record: AgentOpsAuditRecord = {
  id: "evt-1",
  action: "task.started",
  summary: "Run started",
  at: "2026-01-15T00:00:00.000Z",
} as AgentOpsAuditRecord;

beforeEach(() => {
  useActiveBackendMock.mockReset();
  useAgentOpsAuditMock.mockReset();
  publishAgentOpsActivityMock.mockReset();
  // A fresh array/object each call, like a real react-query result after a
  // refetch — only `record.id` is shared across calls, simulating the same
  // audit id reappearing (e.g. from a different backend's independent
  // counter), so the effect's `[audit]` dependency actually changes on
  // rerender instead of accidentally reading a memoized return value.
  useAgentOpsAuditMock.mockImplementation(() => ({ data: [{ ...record }] }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useAgentOpsWorkspaceActivity backend scoping", () => {
  it("resets the dedup set on a backend switch instead of treating a same-id record as already published", () => {
    useActiveBackendMock.mockReturnValue({ backend: { id: "backend-a" } });
    const { rerender } = renderHook(() => useAgentOpsWorkspaceActivity());

    expect(publishAgentOpsActivityMock).toHaveBeenCalledTimes(1);
    const [, firstSet] = publishAgentOpsActivityMock.mock.calls[0] as [
      AgentOpsAuditRecord[],
      Set<string>,
    ];
    // Simulate the collector having already dedup'd this id against backend A.
    firstSet.add(record.id);

    // Switch to a different local backend; the same audit record id (a
    // coincidental collision from the new backend's own append-only log)
    // comes back.
    useActiveBackendMock.mockReturnValue({ backend: { id: "backend-b" } });
    rerender();

    expect(publishAgentOpsActivityMock).toHaveBeenCalledTimes(2);
    const [, secondSet] = publishAgentOpsActivityMock.mock.calls[1] as [
      AgentOpsAuditRecord[],
      Set<string>,
    ];
    expect(secondSet).not.toBe(firstSet);
    expect(secondSet.has(record.id)).toBe(false);
  });

  it("keeps the same dedup set across re-renders on the same backend", () => {
    useActiveBackendMock.mockReturnValue({ backend: { id: "backend-a" } });
    const { rerender } = renderHook(() => useAgentOpsWorkspaceActivity());

    const [, firstSet] = publishAgentOpsActivityMock.mock.calls[0] as [
      AgentOpsAuditRecord[],
      Set<string>,
    ];

    rerender();

    const [, secondSet] = publishAgentOpsActivityMock.mock.calls[1] as [
      AgentOpsAuditRecord[],
      Set<string>,
    ];
    expect(secondSet).toBe(firstSet);
  });
});
