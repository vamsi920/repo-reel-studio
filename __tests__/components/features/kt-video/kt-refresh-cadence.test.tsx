import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { KtRefreshCadence } from "#/components/features/kt-video/kt-refresh-cadence";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import type { KnowledgeRepository } from "#/lib/knowledge/knowledge-engine";

const { generateKnowledgeMock, displayErrorToastMock } = vi.hoisted(() => ({
  generateKnowledgeMock: vi.fn(),
  displayErrorToastMock: vi.fn(),
}));

vi.mock("#/lib/knowledge/generate-knowledge", () => ({
  generateKnowledge: generateKnowledgeMock,
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: displayErrorToastMock,
}));

const snapshot: RepositorySnapshot = {
  repositoryId: "acme/widgets@main",
  owner: "acme",
  repo: "widgets",
  branch: "main",
  commitSha: "abc123",
  localPath: "/workspace/widgets",
};

const knowledge: KnowledgeRepository = {
  repositoryId: snapshot.repositoryId,
  commitSha: "abc123",
  title: "Widgets",
  summary: "A widget factory.",
  sections: [],
  pages: [],
  generatedAt: new Date().toISOString(),
};

function seedReadyEntry(
  conversationUrl: string | null = "https://example.test",
  sessionApiKey: string | null = "session-key",
) {
  useKnowledgeStore
    .getState()
    .startGenerating(snapshot, conversationUrl, sessionApiKey);
  useKnowledgeStore.getState().setReady(snapshot.repositoryId, knowledge);
}

describe("KtRefreshCadence handleRegenerate", () => {
  beforeEach(() => {
    useKnowledgeStore.getState().reset();
    generateKnowledgeMock.mockClear();
    displayErrorToastMock.mockClear();
  });

  it("calls generateKnowledge when a live session exists", () => {
    seedReadyEntry();
    render(<KtRefreshCadence repositoryId={snapshot.repositoryId} />);

    fireEvent.click(screen.getByTestId("kt-regenerate-button"));

    expect(generateKnowledgeMock).toHaveBeenCalledTimes(1);
    expect(displayErrorToastMock).not.toHaveBeenCalled();
  });

  it("refuses to regenerate a cold-rehydrated entry with no live session, instead of asking DeepWiki to index a null/empty target", () => {
    // Mirrors tryColdRehydration's shape: conversationUrl/sessionApiKey null.
    seedReadyEntry(null, null);
    render(<KtRefreshCadence repositoryId={snapshot.repositoryId} />);

    fireEvent.click(screen.getByTestId("kt-regenerate-button"));

    expect(generateKnowledgeMock).not.toHaveBeenCalled();
    expect(displayErrorToastMock).toHaveBeenCalledTimes(1);
  });
});

describe("KtRefreshCadence regenerating status", () => {
  beforeEach(() => {
    useKnowledgeStore.getState().reset();
  });

  it("announces regeneration in a live region while it's in flight, and clears it once idle", () => {
    seedReadyEntry();
    useKnowledgeStore.getState().startGenerating(
      snapshot,
      "https://example.test",
      "session-key",
    );
    const { rerender } = render(
      <KtRefreshCadence repositoryId={snapshot.repositoryId} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("KT$REGENERATING_STATUS");

    useKnowledgeStore.getState().setReady(snapshot.repositoryId, knowledge);
    rerender(<KtRefreshCadence repositoryId={snapshot.repositoryId} />);

    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});

describe("KtRefreshCadence isDue", () => {
  beforeEach(() => {
    useKnowledgeStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips from Regenerate to Update available purely from time passing, with no other store update", () => {
    vi.useFakeTimers();
    seedReadyEntry();
    useKnowledgeStore.getState().setRefreshCadence(snapshot.repositoryId, "daily");
    render(<KtRefreshCadence repositoryId={snapshot.repositoryId} />);

    expect(screen.getByTestId("kt-regenerate-button")).toHaveTextContent(
      "KT$REGENERATE",
    );

    act(() => {
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    });

    expect(screen.getByTestId("kt-regenerate-button")).toHaveTextContent(
      "KT$REFRESH_DUE",
    );
  });
});
