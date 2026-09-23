import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyBrowserMessage } from "#/components/features/browser/empty-browser-message";

// EmptyBrowserMessage has two genuinely different states depending on
// whether the browser tool reported a confirmed URL with no screenshot yet
// (see BrowserPanel's `hasPage` comment) versus no page at all — previously
// covered only indirectly through browser.test.tsx's rendering of
// BrowserPanel, never directly against its own two branches.
describe("EmptyBrowserMessage", () => {
  it("shows the generic no-page message when no url is given", () => {
    render(<EmptyBrowserMessage />);

    expect(screen.getByText("BROWSER$NO_PAGE_LOADED")).toBeInTheDocument();
    expect(
      screen.queryByTestId("browser-page-loaded-no-screenshot"),
    ).not.toBeInTheDocument();
  });

  it("shows the page-loaded-no-screenshot message and the url when a url is given", () => {
    render(<EmptyBrowserMessage url="https://example.com/path" />);

    expect(
      screen.getByTestId("browser-page-loaded-no-screenshot"),
    ).toHaveTextContent("BROWSER$PAGE_LOADED_NO_SCREENSHOT");
    expect(screen.getByText("https://example.com/path")).toBeInTheDocument();
    expect(
      screen.queryByText("BROWSER$NO_PAGE_LOADED"),
    ).not.toBeInTheDocument();
  });

  it("treats an empty-string url the same as no url", () => {
    render(<EmptyBrowserMessage url="" />);

    expect(screen.getByText("BROWSER$NO_PAGE_LOADED")).toBeInTheDocument();
    expect(
      screen.queryByTestId("browser-page-loaded-no-screenshot"),
    ).not.toBeInTheDocument();
  });
});
