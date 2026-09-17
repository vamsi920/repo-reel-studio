import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

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
