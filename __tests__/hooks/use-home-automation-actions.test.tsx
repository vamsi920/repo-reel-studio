import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AutomationService from "#/api/automation-service/automation-service.api";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { useHomeAutomationActions } from "#/hooks/use-home-automation-actions";
import type { Backend } from "#/api/backend-registry/types";
import { AutomationRunStatus, type Automation } from "#/types/automation";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}));

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    dispatchAutomation: vi.fn(),
    toggleAutomation: vi.fn(),
    cancelAutomationRun: vi.fn(),
  },
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

const mintLocalGithubCloneCredentialMock = vi.fn();
vi.mock("#/api/git-service/mint-local-github-clone-credential", () => ({
  mintLocalGithubCloneCredential: (
    ...args: Parameters<typeof mintLocalGithubCloneCredentialMock>
  ) => mintLocalGithubCloneCredentialMock(...args),
}));

const localBackend: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

const automation: Automation = {
  id: "auto-1",
  name: "Test",
  prompt: "p",
  trigger: { type: "schedule", schedule_human: "Daily" },
  enabled: true,
  repository: "acme/repo",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const runningRun = {
  id: "run-1",
  status: AutomationRunStatus.RUNNING,
  conversation_id: null,
  bash_command_id: null,
  error_detail: null,
  started_at: "2026-01-02T00:00:00Z",
  completed_at: null,
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });

  vi.mocked(AutomationService.dispatchAutomation).mockReset();
  vi.mocked(AutomationService.toggleAutomation).mockReset();
  vi.mocked(AutomationService.cancelAutomationRun).mockReset();
  vi.mocked(displayErrorToast).mockClear();
  mintLocalGithubCloneCredentialMock.mockReset();
  mintLocalGithubCloneCredentialMock.mockResolvedValue("github.com");
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

// These three handlers used to call `.mutate()` with per-call
// onSuccess/onError on a mutation instance shared across every consumer
// (pinned home cards, running-automations rows). react-query's mutation
// observer keeps only the *latest* call's per-call callbacks, so a
// re-entrant call before the first settles used to drop the first call's
// toast entirely -- most reachable via the "Turn Off" quick action, whose
// menu item had (and still has) no pending-disabled guard of its own.
// mutateAsync returns each call's own promise, making the toast reliable
// regardless of ordering.
describe("useHomeAutomationActions — reliable toasts under re-entrant calls", () => {
  it("runNow surfaces this call's own error even if an earlier dispatch on the same shared mutation is still pending", async () => {
    let resolveFirst: (() => void) | undefined;
    vi.mocked(AutomationService.dispatchAutomation)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () => resolve(runningRun);
          }),
      )
      .mockRejectedValueOnce(new Error("scheduler offline"));

    const { result } = renderHook(
      () => useHomeAutomationActions(automation, null),
      { wrapper: makeWrapper() },
    );

    // First call, deliberately left unresolved.
    act(() => {
      void result.current.runNow();
    });
    await waitFor(() => {
      expect(AutomationService.dispatchAutomation).toHaveBeenCalledTimes(1);
    });

    // Second call on the same shared mutation instance, this one rejects.
    await act(async () => {
      await result.current.runNow();
    });

    await waitFor(() => {
      expect(displayErrorToast).toHaveBeenCalledWith("scheduler offline");
    });

    resolveFirst?.();
  });

  it("confirmTurnOff surfaces an error toast for a rejected toggle even after an earlier toggle on the same mutation is still in flight", async () => {
    let resolveFirst: ((automationResult: Automation) => void) | undefined;
    vi.mocked(AutomationService.toggleAutomation)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("backend unreachable"));

    const { result } = renderHook(
      () => useHomeAutomationActions(automation, null),
      { wrapper: makeWrapper() },
    );

    act(() => {
      result.current.requestTurnOff();
    });
    act(() => {
      void result.current.confirmTurnOff();
    });
    await waitFor(() => {
      expect(AutomationService.toggleAutomation).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.requestTurnOff();
    });
    await act(async () => {
      await result.current.confirmTurnOff();
    });

    await waitFor(() => {
      expect(displayErrorToast).toHaveBeenCalledWith("backend unreachable");
    });

    resolveFirst?.({ ...automation, enabled: false });
  });

  it("cancelRun surfaces this call's own error even if an earlier cancel on the same mutation is still pending", async () => {
    let resolveFirst: (() => void) | undefined;
    vi.mocked(AutomationService.cancelAutomationRun)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () => resolve(runningRun);
          }),
      )
      .mockRejectedValueOnce(new Error("run already finished"));

    const { result, rerender } = renderHook(
      ({ run }: { run: typeof runningRun }) =>
        useHomeAutomationActions(automation, run),
      { wrapper: makeWrapper(), initialProps: { run: runningRun } },
    );

    act(() => {
      void result.current.cancelRun();
    });
    await waitFor(() => {
      expect(AutomationService.cancelAutomationRun).toHaveBeenCalledTimes(1);
    });

    rerender({ run: { ...runningRun, id: "run-2" } });
    await act(async () => {
      await result.current.cancelRun();
    });

    await waitFor(() => {
      expect(displayErrorToast).toHaveBeenCalledWith("run already finished");
    });

    resolveFirst?.();
  });
});
