import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  NavigationProvider,
  type NavigationContextValue,
} from "#/context/navigation-context";
import { KtBreadcrumb } from "#/components/features/kt-video/kt-breadcrumb";

function renderBreadcrumb(
  props: Parameters<typeof KtBreadcrumb>[0] = {},
  overrides: Partial<NavigationContextValue> = {},
) {
  const value: NavigationContextValue = {
    currentPath: "/kt",
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
    ...overrides,
  };

  const result = render(
    <NavigationProvider value={value}>
      <KtBreadcrumb {...props} />
    </NavigationProvider>,
  );

  return { ...result, navigate: value.navigate };
}

describe("KtBreadcrumb", () => {
  it("at the workspace-list depth shows only the root crumb", () => {
    renderBreadcrumb();

    expect(screen.getByText("KT$TITLE")).toBeInTheDocument();
    expect(screen.queryByText("Widgets")).not.toBeInTheDocument();
  });

  it("navigates to the workspace list when the root crumb is clicked", () => {
    const { navigate } = renderBreadcrumb();

    fireEvent.click(screen.getByText("KT$TITLE"));

    expect(navigate).toHaveBeenCalledWith("/kt");
  });

  it("at the repository depth renders the repository as plain text, not a link", () => {
    renderBreadcrumb({ repositoryLabel: "acme/widgets" });

    const crumb = screen.getByText("acme/widgets");
    expect(crumb.tagName).toBe("SPAN");
  });

  it("at the page depth, clicking the repository crumb navigates back to that repository's page list", () => {
    const { navigate } = renderBreadcrumb({
      repositoryLabel: "acme/widgets",
      repositoryId: "acme/widgets@main",
      pageTitle: "Auth Flow",
    });

    fireEvent.click(screen.getByText("acme/widgets"));

    expect(navigate).toHaveBeenCalledWith(
      `/kt/${encodeURIComponent("acme/widgets@main")}`,
    );
  });

  it("still gives the repository crumb a working destination when repositoryId is missing", () => {
    const { navigate } = renderBreadcrumb({
      repositoryLabel: "acme/widgets",
      pageTitle: "Auth Flow",
    });

    fireEvent.click(screen.getByText("acme/widgets"));

    expect(navigate).toHaveBeenCalledWith("/kt/");
  });

  it("renders the page title as plain text at the deepest depth", () => {
    renderBreadcrumb({
      repositoryLabel: "acme/widgets",
      repositoryId: "acme/widgets@main",
      pageTitle: "Auth Flow",
    });

    const crumb = screen.getByText("Auth Flow");
    expect(crumb.tagName).toBe("SPAN");
  });
});
