/**
 * The Usage page is the only place these numbers are ever shown, so what it
 * must not do matters as much as what it shows: never invent a cost, never
 * report a saving it did not measure, never show a blank page just because no
 * conversation happens to be open, and never surface another workspace.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetWorkspaceMemoryStorage,
  writeRecords,
} from "#/api/workspace-memory/workspace-memory-store.api";
import { resetMirrorQueue } from "#/api/workspace-memory/workspace-memory-mirror";
import { computeWorkspaceId, type SavingsSample } from "#/lib/workspace-memory";
import { I18nKey } from "#/i18n/declaration";
import { makeRecord } from "#/lib/workspace-memory/test-fixtures";
import useWorkspaceMemoryStore from "#/stores/workspace-memory-store";

const BACKEND_ID = "backend-1";
const WORKSPACE = computeWorkspaceId(BACKEND_ID, "/w/a")!;
const OTHER_WORKSPACE = computeWorkspaceId(BACKEND_ID, "/w/b")!;

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({
    backend: { id: BACKEND_ID, kind: "local" },
    orgId: null,
  }),
}));

vi.mock("#/hooks/query/use-resolved-workspaces", () => ({
  useResolvedWorkspaces: () => ({
    workspaces: [
      { id: "a", name: "Workspace A", path: "/w/a" },
      { id: "b", name: "Workspace B", path: "/w/b" },
    ],
    parents: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

import UsageRoute from "./usage";

function sample(
  workspaceId: string,
  overrides: Partial<SavingsSample> = {},
): SavingsSample {
  return {
    workspaceId,
    conversationId: "conv-1",
    at: new Date().toISOString(),
    candidateRawTokens: 10_000,
    selectedTokensBeforeCompression: 2_000,
    finalContextTokens: 1_600,
    cachedTokensReused: 0,
    compressionRatio: 0.2,
    model: "claude-sonnet-4-5",
    fromCache: false,
    ...overrides,
  };
}

function selectWorkspace(workspaceId: string) {
  fireEvent.change(screen.getByTestId("usage-workspace-select"), {
    target: { value: workspaceId },
  });
}

beforeEach(() => {
  resetWorkspaceMemoryStorage();
  resetMirrorQueue();
  window.sessionStorage.clear();
  useWorkspaceMemoryStore.setState({
    activeWorkspaceId: null,
    activity: [],
    samplesByWorkspace: {},
    lastMirrorByWorkspace: {},
  });
});

describe("Usage route", () => {
  it("defaults to All workspaces rather than a blank page with nothing selectable", () => {
    render(<UsageRoute />);

    expect(
      screen.getByRole<HTMLSelectElement>("combobox", {
        name: I18nKey.USAGE$WORKSPACE_COLUMN,
      }).value,
    ).toBe("__all__");
    expect(screen.getByText("Workspace A")).toBeInTheDocument();
    expect(screen.getByText("Workspace B")).toBeInTheDocument();
    expect(screen.getByText(/Nothing measured yet/i)).toBeInTheDocument();
  });

  it("shows the aggregate immediately when data exists in more than one workspace", () => {
    useWorkspaceMemoryStore.getState().recordSavings(sample(WORKSPACE));
    useWorkspaceMemoryStore.getState().recordSavings(sample(OTHER_WORKSPACE));

    render(<UsageRoute />);

    // 1.6k + 1.6k sent, formatted by formatCompactTokenCount.
    expect(screen.getByText("3.2k")).toBeInTheDocument();
  });

  it("renders a dash instead of a cost for an unpriced model", async () => {
    useWorkspaceMemoryStore
      .getState()
      .recordSavings(sample(WORKSPACE, { model: "some-internal-model-v9" }));
    render(<UsageRoute />);

    await userEvent.click(screen.getByTestId("usage-tab-costs"));

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(I18nKey.USAGE$UNPRICED_NOTE).length,
    ).toBeGreaterThan(0);
  });

  it("shows a per-workspace breakdown, with counts only, in Memory Health", async () => {
    const conflictA = makeRecord({
      subject: "payments:transport",
      statement: "Payments uses REST.",
      provenance: {
        source: "repository-evidence",
        conversationId: "conv-1",
        observedAt: "2026-03-01T12:00:00.000Z",
        filePath: "docs/a.md",
        commitSha: "aaa",
      },
    });
    const conflictAPeer = makeRecord({
      subject: "payments:transport",
      statement: "Payments uses gRPC.",
      provenance: {
        source: "repository-evidence",
        conversationId: "conv-1",
        observedAt: "2026-03-01T12:00:30.000Z",
        filePath: "docs/b.md",
        commitSha: "aaa",
      },
    });
    writeRecords(WORKSPACE, [
      {
        ...conflictA,
        workspaceId: WORKSPACE,
        status: "conflicted",
        conflictsWith: [conflictAPeer.id],
      },
      {
        ...conflictAPeer,
        workspaceId: WORKSPACE,
        status: "conflicted",
        conflictsWith: [conflictA.id],
      },
    ]);

    render(<UsageRoute />);
    await userEvent.click(screen.getByTestId("usage-tab-memory-health"));

    expect(
      screen.getByText(I18nKey.USAGE$BY_WORKSPACE_TITLE),
    ).toBeInTheDocument();
    // "Workspace A" also appears as a <select> option, so scope to the table cell.
    expect(
      screen.getByRole("cell", { name: "Workspace A" }),
    ).toBeInTheDocument();
    // Record text must not leak into the aggregate view.
    expect(screen.queryByText(/Payments uses REST/)).toBeNull();
  });

  it("scopes to one workspace's memories, with full conflict detail, once selected", async () => {
    const mine = makeRecord({
      subject: "payments:transport",
      statement: "Payments moved to gRPC.",
    });
    const theirs = makeRecord({
      subject: "billing:transport",
      statement: "Billing still uses REST.",
    });
    writeRecords(WORKSPACE, [{ ...mine, workspaceId: WORKSPACE }]);
    writeRecords(OTHER_WORKSPACE, [
      { ...theirs, workspaceId: OTHER_WORKSPACE },
    ]);

    render(<UsageRoute />);
    selectWorkspace(WORKSPACE);
    await userEvent.click(screen.getByTestId("usage-tab-memory-health"));

    expect(
      screen.getByText(I18nKey.USAGE$WORKSPACE_MEMORIES_LABEL),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Billing still uses REST/)).toBeNull();
    expect(screen.queryByText(I18nKey.USAGE$BY_WORKSPACE_TITLE)).toBeNull();
  });

  it("shows every workspace's activity by default, and only one once selected", () => {
    useWorkspaceMemoryStore.getState().pushActivity({
      id: "a1",
      workspaceId: WORKSPACE,
      at: new Date().toISOString(),
      kind: "learned",
      summary: "Memory updater: 2 validated facts added",
    });
    useWorkspaceMemoryStore.getState().pushActivity({
      id: "a2",
      workspaceId: OTHER_WORKSPACE,
      at: new Date().toISOString(),
      kind: "learned",
      summary: "Memory updater: activity from workspace B",
    });

    render(<UsageRoute />);

    expect(
      screen.getByText("Memory updater: 2 validated facts added"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Memory updater: activity from workspace B"),
    ).toBeInTheDocument();

    selectWorkspace(WORKSPACE);

    expect(
      screen.getByText("Memory updater: 2 validated facts added"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/workspace B/)).toBeNull();
  });

  it("does not offer a Memory nav surface of its own", () => {
    render(<UsageRoute />);
    expect(
      screen.getByRole("heading", { name: I18nKey.USAGE$PAGE_TITLE }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("usage-tab-memory")).toBeNull();
  });
});
