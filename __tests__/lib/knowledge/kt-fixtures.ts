import type {
  KnowledgeRepository,
  RepositorySnapshot,
} from "#/lib/knowledge/knowledge-engine";

export const KT_SNAPSHOT: RepositorySnapshot = {
  repositoryId: "acme/shop@main",
  owner: "acme",
  repo: "shop",
  branch: "main",
  commitSha: "abc1234def",
  localPath: "/workspace/shop",
};

export const KT_KNOWLEDGE: KnowledgeRepository = {
  repositoryId: "acme/shop@main",
  commitSha: "abc1234def",
  title: "Acme Shop",
  summary: "Storefront with a payments service.",
  generatedAt: "2026-10-01T00:00:00.000Z",
  sections: [
    { id: "core", title: "Core", pageIds: ["payments/flow", "checkout"] },
  ],
  pages: [
    {
      id: "payments/flow",
      title: "Payments Flow",
      description: "How charges are captured",
      contentMarkdown: "Charges go through `capture()`; it's $(rm -rf /) safe.",
      importance: "high",
      relevantFiles: [
        { path: "src/payments/capture.ts", startLine: 10, endLine: 40 },
      ],
      diagrams: [{ id: "d1", type: "flow", mermaid: "graph TD; A-->B" }],
      relatedPageIds: ["checkout"],
    },
    {
      id: "checkout",
      title: "Checkout",
      description: "Cart to order",
      contentMarkdown: "Checkout builds an order.",
      importance: "medium",
      relevantFiles: [{ path: "src/checkout/cart.ts" }],
      diagrams: [],
      relatedPageIds: [],
    },
  ],
};
