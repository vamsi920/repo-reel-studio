// @spec RAG-001 — the Neo RAG module: collections and the Ask playground
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";

import { RagHome } from "#/components/features/rag/rag-home";
import { RagAskTab } from "#/components/features/rag/rag-ask-tab";
import type { RagCollection } from "#/api/rag/rag-service.api";

const ragService = vi.hoisted(() => ({
  listCollections: vi.fn(),
  answer: vi.fn(),
  search: vi.fn(),
}));

vi.mock("#/api/rag/rag-service.api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isRagAvailable: () => true,
  RagService: ragService,
}));

const COLLECTION: RagCollection = {
  id: "col-1",
  org_id: "org-1",
  name: "Payments platform",
  description: "Runbooks and decisions",
  created_at: "2026-11-25T00:00:00Z",
  updated_at: "2026-11-25T00:00:00Z",
  source_count: 2,
  document_count: 5,
  chunk_count: 40,
  last_synced_at: "2026-11-25T01:00:00Z",
};

const HIT = {
  chunk_id: "ch-1",
  document_id: "d-1",
  source_id: "s-1",
  collection_id: "col-1",
  title: "Runbook",
  uri: "https://docs.example.com/runbook",
  heading_path: "Deploy",
  source_kind: "url" as const,
  source_name: "docs",
  content: "Deploys need two approvals.",
  score: 0.03,
  vector_rank: 1,
  text_rank: 2,
  vector_similarity: 0.81,
  rerank_score: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RagHome", () => {
  it("lists the team's collections with their size", async () => {
    ragService.listCollections.mockResolvedValue([COLLECTION]);

    renderWithProviders(<RagHome />);

    const card = await screen.findByTestId("rag-collection-card");
    expect(within(card).getByText("Payments platform")).toBeInTheDocument();
    expect(
      within(card).getByText("Runbooks and decisions"),
    ).toBeInTheDocument();
    expect(ragService.listCollections).toHaveBeenCalledTimes(1);
  });
});

describe("RagAskTab", () => {
  it("shows a grounded answer whose citations point at the retrieved passage", async () => {
    ragService.answer.mockResolvedValue({
      query: "How do we deploy?",
      answer: "Deploys need two approvals [1]. Rollbacks are automatic [3].",
      found: true,
      cited: [1],
      invalid_citations: [3],
      sources: [{ ...HIT, n: 1 }],
      timings: { total_ms: 1200 },
    });
    renderWithProviders(<RagAskTab collection={COLLECTION} />);

    fireEvent.change(screen.getByTestId("rag-question"), {
      target: { value: "How do we deploy?" },
    });
    fireEvent.click(screen.getByTestId("rag-ask"));

    expect(await screen.findByTestId("rag-answer")).toHaveTextContent(
      "Deploys need two approvals",
    );
    expect(ragService.answer).toHaveBeenCalledWith(
      ["col-1"],
      "How do we deploy?",
      { rerank: true, expand: false },
    );
    const citations = screen.getAllByTestId("rag-citation");
    expect(citations.map((c) => c.textContent)).toEqual(["1", "3"]);
    // The test i18n renders keys: the warning about citation [3] is shown.
    expect(screen.getByText("RAG$INVALID_CITATIONS")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("rag-hit")).getByText("Runbook"),
    ).toBeInTheDocument();
  });

  it("says plainly when the sources do not contain the answer", async () => {
    ragService.answer.mockResolvedValue({
      query: "Who owns billing?",
      answer: "I could not find this in the connected sources.",
      found: false,
      cited: [],
      invalid_citations: [],
      sources: [],
      timings: {},
    });
    renderWithProviders(<RagAskTab collection={COLLECTION} />);

    fireEvent.change(screen.getByTestId("rag-question"), {
      target: { value: "Who owns billing?" },
    });
    fireEvent.click(screen.getByTestId("rag-ask"));

    expect(await screen.findByTestId("rag-not-found")).toBeInTheDocument();
  });
});
