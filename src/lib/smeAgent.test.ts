import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSmeDocument,
  buildSmeCorpusBlock,
  deleteSmeDocument,
  getSmeDocuments,
  hasSmeMaterial,
} from "./smeKnowledge";
import {
  getSmeReviews,
  runSmeReview,
  subscribeSmeActivity,
  type SmeActivity,
} from "./smeAgent";

const PROJECT = "sme-test-project";

function mockGeminiResponse(payload: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      candidates: [
        { content: { parts: [{ text: JSON.stringify(payload) }] } },
      ],
    }),
  } as unknown as Response);
}

describe("smeKnowledge", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds, lists, and deletes documents per project", () => {
    const doc = addSmeDocument(PROJECT, {
      title: "Payments glossary",
      content: "Settlement happens T+2.",
    });
    expect(doc).not.toBeNull();
    expect(hasSmeMaterial(PROJECT)).toBe(true);
    expect(getSmeDocuments(PROJECT)).toHaveLength(1);
    expect(hasSmeMaterial("other")).toBe(false);

    deleteSmeDocument(PROJECT, doc!.id);
    expect(hasSmeMaterial(PROJECT)).toBe(false);
  });

  it("rejects empty uploads", () => {
    expect(addSmeDocument(PROJECT, { title: "", content: "x" })).toBeNull();
    expect(addSmeDocument(PROJECT, { title: "x", content: " " })).toBeNull();
  });

  it("builds a budget-capped corpus block", () => {
    addSmeDocument(PROJECT, { title: "Doc A", content: "a".repeat(500) });
    addSmeDocument(PROJECT, { title: "Doc B", content: "b".repeat(500) });
    const block = buildSmeCorpusBlock(PROJECT, { maxChars: 700 });
    expect(block).toContain("SME DOCUMENT");
    expect(block.length).toBeLessThanOrEqual(750);
  });
});

describe("smeAgent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns no_material when the project has no SME docs", async () => {
    const review = await runSmeReview({
      projectId: PROJECT,
      step: "manifest",
      label: "Video narration",
      content: "Some narration text",
    });
    expect(review.status).toBe("no_material");
    expect(getSmeReviews(PROJECT)[0].status).toBe("no_material");
  });

  it("parses a verified verdict and records history", async () => {
    addSmeDocument(PROJECT, {
      title: "Domain truths",
      content: "Settlement happens T+2. Refunds take 5 days.",
    });
    mockGeminiResponse({
      verdict: "verified",
      summary: "All claims consistent.",
      findings: [],
    });

    const states: SmeActivity["state"][] = [];
    const unsub = subscribeSmeActivity(PROJECT, (a) => states.push(a.state));

    const review = await runSmeReview({
      projectId: PROJECT,
      step: "manifest",
      label: "Video narration",
      content: "Settlement happens T+2.",
    });
    unsub();

    expect(review.status).toBe("verified");
    expect(states).toContain("checking");
    expect(states[states.length - 1]).toBe("idle");
    expect(getSmeReviews(PROJECT)[0].status).toBe("verified");
  });

  it("normalizes flagged findings", async () => {
    addSmeDocument(PROJECT, {
      title: "Domain truths",
      content: "Settlement happens T+2.",
    });
    mockGeminiResponse({
      verdict: "flagged",
      summary: "One factual conflict.",
      findings: [
        {
          severity: "high",
          claim: "Settlement is instant",
          issue: "Contradicts knowledge base",
          correction: "Settlement happens T+2",
        },
        { severity: "weird", claim: "minor thing", issue: "unsupported" },
      ],
    });

    const review = await runSmeReview({
      projectId: PROJECT,
      step: "repo-qa",
      label: "Q&A answer",
      content: "Settlement is instant.",
    });

    expect(review.status).toBe("flagged");
    expect(review.findings).toHaveLength(2);
    expect(review.findings[0].severity).toBe("high");
    expect(review.findings[1].severity).toBe("low");
  });

  it("degrades to an error review instead of throwing", async () => {
    addSmeDocument(PROJECT, { title: "Doc", content: "Truths." });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const review = await runSmeReview({
      projectId: PROJECT,
      step: "manifest",
      label: "Video narration",
      content: "text",
    });
    expect(review.status).toBe("error");
    expect(review.summary).toContain("SME reviewer unavailable");
  });
});
