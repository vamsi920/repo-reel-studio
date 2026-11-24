import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "test-utils";

import { resetWorkspaceMemoryStorage } from "#/api/workspace-memory/workspace-memory-store.api";
import { resetMirrorQueue } from "#/api/workspace-memory/workspace-memory-mirror";
import { NeoBrainPanel } from "#/components/features/neo-brain/neo-brain-panel";
import {
  computeWorkspaceId,
  drainMemoryUpdater,
  resetMemoryUpdater,
  WorkspaceContextService,
} from "#/lib/workspace-memory";
import { ingestUserMessage } from "#/services/neo-brain";
import { useNeoBrainStore } from "#/stores/neo-brain-store";

const WORKSPACE = computeWorkspaceId("backend-1", "/work/shop")!;

function say(text: string) {
  ingestUserMessage(text, { workspaceId: WORKSPACE, conversationId: "c1" });
  drainMemoryUpdater();
}

beforeEach(() => {
  resetWorkspaceMemoryStorage();
  resetMirrorQueue();
  resetMemoryUpdater();
  WorkspaceContextService.resetCache();
  useNeoBrainStore.getState().reset();
});

describe("NeoBrainPanel", () => {
  it("shows what the brain learned, by layer", () => {
    say("Use pnpm, not npm. Never push directly to main.");

    renderWithProviders(<NeoBrainPanel workspaceId={WORKSPACE} />);

    expect(
      within(screen.getByTestId("neo-brain-layer-gate")).getByText(
        "Never push directly to main.",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("neo-brain-layer-convention")).getByText(
        "Use pnpm instead of npm.",
      ),
    ).toBeInTheDocument();
  });

  it("moves an approved correction from review into the brain", () => {
    say("No, the payments service lives in services/billing.");
    renderWithProviders(<NeoBrainPanel workspaceId={WORKSPACE} />);
    expect(screen.getByTestId("neo-brain-empty")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("neo-brain-approve"));

    expect(screen.queryByTestId("neo-brain-pending-item")).toBeNull();
    expect(
      within(screen.getByTestId("neo-brain-layer-fact")).getByText(
        "The payments service lives in services/billing.",
      ),
    ).toBeInTheDocument();
  });

  it("asks for a workspace when none is selected", () => {
    renderWithProviders(<NeoBrainPanel workspaceId={null} />);
    expect(screen.getByTestId("neo-brain-pick-workspace")).toBeInTheDocument();
  });
});
