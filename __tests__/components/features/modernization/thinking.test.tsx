import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import {
  THINKING_PHRASES,
  ThinkingPhrase,
  useNeoMeThinking,
} from "#/components/features/modernization/studio/thinking";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { MIGRATION_PHASES } from "#/constants/modernization-control";

function Probe() {
  return <span data-testid="probe">{String(useNeoMeThinking())}</span>;
}

describe("Neo ME thinking motion", () => {
  afterEach(() => {
    vi.useRealTimers();
    act(() => useConversationStateStore.getState().reset());
  });

  it("is on only while the agent is running", () => {
    renderWithProviders(<Probe />);
    act(() =>
      useConversationStateStore
        .getState()
        .setExecutionStatus(ExecutionStatus.RUNNING),
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("true");
    act(() =>
      useConversationStateStore
        .getState()
        .setExecutionStatus(ExecutionStatus.IDLE),
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("false");
  });

  it("has phrases for every phase and cycles them over time", () => {
    for (const phase of MIGRATION_PHASES) {
      expect(THINKING_PHRASES[phase].length).toBeGreaterThan(0);
    }
    vi.useFakeTimers();
    renderWithProviders(<ThinkingPhrase phase="migrate" />);
    const first = screen.getByTestId("neome-thinking-phrase").textContent;
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(screen.getByTestId("neome-thinking-phrase").textContent).not.toBe(
      first,
    );
  });
});
