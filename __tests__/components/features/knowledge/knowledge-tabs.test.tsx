import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeTabs } from "#/components/features/knowledge/knowledge-tabs";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderTabs(
  repositoryId: string,
  active: "docs" | "video" | "graph" = "docs",
) {
  return render(
    <MemoryRouter>
      <KnowledgeTabs repositoryId={repositoryId} active={active} />
    </MemoryRouter>,
  );
}

describe("KnowledgeTabs", () => {
  it("offers all three ways to understand a repository", () => {
    renderTabs("acme/app");

    expect(screen.getByTestId("knowledge-tab-docs")).toBeInTheDocument();
    expect(screen.getByTestId("knowledge-tab-video")).toBeInTheDocument();
    expect(screen.getByTestId("knowledge-tab-graph")).toBeInTheDocument();
  });

  it("points Docs at the existing repository route, unchanged", () => {
    renderTabs("acme/app");

    expect(screen.getByTestId("knowledge-tab-docs")).toHaveAttribute(
      "href",
      "/kt/acme%2Fapp",
    );
  });

  it("routes Video KT and CodeGraph to static segments", () => {
    renderTabs("acme/app");

    expect(screen.getByTestId("knowledge-tab-video")).toHaveAttribute(
      "href",
      "/kt/acme%2Fapp/video",
    );
    expect(screen.getByTestId("knowledge-tab-graph")).toHaveAttribute(
      "href",
      "/kt/acme%2Fapp/graph",
    );
  });

  it("encodes repository ids so a slash cannot break the route", () => {
    renderTabs("org/sub/repo");

    expect(screen.getByTestId("knowledge-tab-graph")).toHaveAttribute(
      "href",
      "/kt/org%2Fsub%2Frepo/graph",
    );
  });

  it("marks only the tab the route says is active", () => {
    // `/kt/:id` is a prefix of both sub-tab routes, so relying on NavigationLink's
    // own path matching would light up Docs here too.
    renderTabs("acme/app", "graph");

    expect(screen.getByTestId("knowledge-tab-graph")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("knowledge-tab-docs")).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(screen.getByTestId("knowledge-tab-video")).toHaveAttribute(
      "data-active",
      "false",
    );
  });
});
