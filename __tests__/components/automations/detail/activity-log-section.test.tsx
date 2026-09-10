import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityLogSection } from "#/components/features/automations/detail/activity-log-section";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AutomationRunStatus,
  type Automation,
  type AutomationRun,
} from "#/types/automation";
import { downloadActivityLogExport } from "#/utils/automation-activity-log-export";

const { trackAutomationActivityLogExported } = vi.hoisted(() => ({
  trackAutomationActivityLogExported: vi.fn(),
}));

vi.mock("#/utils/automation-activity-log-export", () => ({
  downloadActivityLogExport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackAutomationActivityLogExported,
  }),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({
    backend: { id: "default-local", kind: "local" },
    orgId: null,
  }),
}));

vi.mock("#/hooks/query/use-automation-detail", () => ({
  useAutomationRuns: vi.fn(),
}));

import { useAutomationRuns } from "#/hooks/query/use-automation-detail";

const automation: Automation = {
  id: "a1",
  name: "Test Activity Log",
  trigger: { type: "cron", schedule: "0 9 * * 1-5", timezone: "UTC" },
  enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  prompt: "hello",
};

const run: AutomationRun = {
  id: "r1",
  status: AutomationRunStatus.COMPLETED,
  conversation_id: "c1",
  bash_command_id: "b1",
  error_detail: null,
  started_at: "2026-01-01T09:00:00Z",
  completed_at: "2026-01-01T09:01:00Z",
};

function renderSection(highlightedRunId: string | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ActivityLogSection
        automation={automation}
        highlightedRunId={highlightedRunId}
      />
    </QueryClientProvider>,
  );
}

describe("ActivityLogSection export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAutomationRuns).mockReturnValue({
      data: { runs: [run], total: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof useAutomationRuns>);
  });

  it("exports JSON via the activity-log export helper and tracks it", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByTestId("activity-log-export-json"));

    await waitFor(() => {
      expect(downloadActivityLogExport).toHaveBeenCalledWith({
        automation,
        format: "json",
        conversationBaseUrl: window.location.origin,
      });
    });
    expect(trackAutomationActivityLogExported).toHaveBeenCalledWith({
      backendKind: "local",
      format: "json",
    });
  });

  it("exports CSV via the activity-log export helper and tracks it", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByTestId("activity-log-export-csv"));

    await waitFor(() => {
      expect(downloadActivityLogExport).toHaveBeenCalledWith({
        automation,
        format: "csv",
        conversationBaseUrl: window.location.origin,
      });
    });
    expect(trackAutomationActivityLogExported).toHaveBeenCalledWith({
      backendKind: "local",
      format: "csv",
    });
  });

  it("disables export when there are no runs", () => {
    vi.mocked(useAutomationRuns).mockReturnValue({
      data: { runs: [], total: 0 },
      isLoading: false,
    } as unknown as ReturnType<typeof useAutomationRuns>);

    renderSection();

    expect(screen.getByTestId("activity-log-export-json")).toBeDisabled();
    expect(screen.getByTestId("activity-log-export-csv")).toBeDisabled();
  });
});

describe("ActivityLogSection ?run= highlight", () => {
  function makeRuns(count: number): AutomationRun[] {
    return Array.from({ length: count }, (_, index) => ({
      ...run,
      id: `r${index + 1}`,
    }));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("marks the deep-linked run and scrolls it into view", async () => {
    vi.mocked(useAutomationRuns).mockReturnValue({
      data: { runs: [run], total: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof useAutomationRuns>);

    renderSection("r1");

    expect(
      screen.getByTestId("automation-run-highlight-r1"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it("scrolls to the deep-linked run once, not on every runs refetch", async () => {
    // Arrange — the runs query polls every 3s while a run is in flight, and
    // each answer is a new array. The section used to re-centre the page on
    // the highlighted row on every one of them, so the reader could not
    // scroll away.
    vi.mocked(useAutomationRuns).mockReturnValue({
      data: { runs: [run, { ...run, id: "r2" }], total: 2 },
      isLoading: false,
    } as unknown as ReturnType<typeof useAutomationRuns>);
    const { rerender } = renderSection("r1");
    await waitFor(() => {
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(
        1,
      );
    });

    // Act — a refetch delivers a fresh array with the same run ids.
    vi.mocked(useAutomationRuns).mockReturnValue({
      data: {
        runs: [
          { ...run, status: AutomationRunStatus.RUNNING },
          { ...run, id: "r2" },
        ],
        total: 2,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useAutomationRuns>);
    rerender(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ActivityLogSection automation={automation} highlightedRunId="r1" />
      </QueryClientProvider>,
    );

    // Assert — still highlighted, but not scrolled to again.
    expect(
      screen.getByTestId("automation-run-highlight-r1"),
    ).toBeInTheDocument();
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(
      1,
    );
  });

  it("does not request the next page while the previous one is still the placeholder", async () => {
    // Arrange — with `keepPreviousData` the 20-run page stays on screen after
    // the limit grows to 40. Deciding from that placeholder would ask for 60,
    // 80 and 100 before the 40-run page ever landed.
    vi.mocked(useAutomationRuns).mockImplementation(
      (options) =>
        ({
          data: { runs: makeRuns(20), total: 500 },
          isLoading: false,
          isPlaceholderData: (options.limit ?? 20) > 20,
        }) as unknown as ReturnType<typeof useAutomationRuns>,
    );

    renderSection("r-missing");

    await waitFor(() => {
      expect(useAutomationRuns).toHaveBeenCalledWith({
        id: "a1",
        limit: 40,
        offset: 0,
      });
    });
    const requestedLimits = vi
      .mocked(useAutomationRuns)
      .mock.calls.map(([options]) => options.limit ?? 0);
    expect(Math.max(...requestedLimits)).toBe(40);
  });

  it("stops auto-loading pages for a missing run id at the cap", async () => {
    vi.mocked(useAutomationRuns).mockImplementation(
      (options) =>
        ({
          data: { runs: makeRuns(options.limit ?? 20), total: 500 },
          isLoading: false,
        }) as unknown as ReturnType<typeof useAutomationRuns>,
    );

    renderSection("r-missing");

    await waitFor(() => {
      expect(useAutomationRuns).toHaveBeenCalledWith({
        id: "a1",
        limit: 100,
        offset: 0,
      });
    });

    const requestedLimits = vi
      .mocked(useAutomationRuns)
      .mock.calls.map(([options]) => options.limit ?? 0);
    expect(Math.max(...requestedLimits)).toBe(100);
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("ActivityLogSection error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says the runs failed to load and retries on demand", async () => {
    // Arrange — the runs query rejected. The section used to render just its
    // header: no rows, no empty state, no error, nothing to click.
    const refetch = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAutomationRuns).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useAutomationRuns>);
    const user = userEvent.setup();
    renderSection();

    // Assert — error state, export disabled, and Retry refetches.
    expect(
      screen.getByTestId("automation-activity-log-error"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("activity-log-export-json")).toBeDisabled();

    // Act
    await user.click(
      screen.getByRole("button", { name: "AUTOMATIONS$ERROR_RETRY" }),
    );
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the loaded rows and disables Load more while the next page is fetching", () => {
    // Arrange — the previous page is the placeholder for the larger request.
    vi.mocked(useAutomationRuns).mockReturnValue({
      data: { runs: [run], total: 5 },
      isLoading: false,
      isFetching: true,
      isPlaceholderData: true,
    } as unknown as ReturnType<typeof useAutomationRuns>);

    renderSection();

    // Assert — no skeleton swap; the button is inert until the page lands.
    expect(screen.getByTestId("activity-log-load-more")).toBeDisabled();
    expect(
      screen.queryByTestId("automation-activity-log-error"),
    ).not.toBeInTheDocument();
  });
});
