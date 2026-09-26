import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PullRequestsTable } from "#/components/features/automations/pull-requests/pull-requests-table";
import type { NeodevexPullRequestWithAutomation } from "#/hooks/query/use-neodevex-pull-requests";

const pr: NeodevexPullRequestWithAutomation = {
  id: "pr-1",
  number: 42,
  title: "Add dark mode",
  url: "https://github.com/acme/repo/pull/42",
  repository: "acme/repo",
  branch: "neodevex/knowledge-kt/add-dark-mode",
  state: "open",
  isDraft: false,
  createdAt: "2026-09-20T00:00:00Z",
  updatedAt: "2026-09-20T00:00:00Z",
  mergedAt: null,
  closedAt: null,
  automationLabel: "Knowledge/KT",
};

describe("PullRequestsTable", () => {
  it("renders nothing for an empty list instead of an empty table shell", () => {
    const { container } = render(<PullRequestsTable pullRequests={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one row per PR, linking the title to the PR url", () => {
    render(<PullRequestsTable pullRequests={[pr]} />);

    expect(screen.getByTestId(`pull-request-row-${pr.id}`)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: new RegExp(pr.title) });
    expect(link).toHaveAttribute("href", pr.url);
    expect(screen.getByText(pr.automationLabel)).toBeInTheDocument();
  });
});
