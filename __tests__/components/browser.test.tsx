import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, render } from "@testing-library/react";
import React from "react";

// Mock modules before importing the component
vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: () => ({ conversationId: "test-conversation-id" }),
  useConversationId: () => ({ conversationId: "test-conversation-id" }),
}));

vi.mock("#/context/conversation-context", () => ({
  useConversation: () => ({ conversationId: "test-conversation-id" }),
  ConversationProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...(actual as object),
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: {
        changeLanguage: () => new Promise(() => {}),
      },
    }),
  };
});

import { BrowserPanel } from "#/components/features/browser/browser";
import { useBrowserStore } from "#/stores/browser-store";

describe("Browser", () => {
  beforeEach(() => {
    useBrowserStore.getState().reset();
  });

  afterEach(() => {
    useBrowserStore.getState().reset();
    vi.clearAllMocks();
  });

  it("renders a message if no screenshotSrc is provided", () => {
    useBrowserStore.setState({
      url: "https://example.com",
      screenshotSrc: "",
    });

    render(<BrowserPanel />);

    expect(screen.getByText("BROWSER$NO_PAGE_LOADED")).toBeInTheDocument();
    expect(screen.getByTestId("browser-chrome-bar")).toBeInTheDocument();
    expect(screen.getByTestId("browser-chrome-url")).toHaveTextContent(
      "https://example.com",
    );
  });

  it("keeps the chrome bar height and disables open-in-new-tab when empty", () => {
    useBrowserStore.setState({
      url: "",
      screenshotSrc: "",
    });

    render(<BrowserPanel />);

    expect(screen.getByTestId("browser-chrome-bar")).toHaveClass(
      "min-h-[34px]",
    );
    expect(screen.getByTestId("browser-chrome-url")).toHaveTextContent(
      "BROWSER$URL_PLACEHOLDER",
    );
    expect(
      screen.queryByRole("button", { name: "BUTTON$BACK" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "BUTTON$OPEN_IN_NEW_TAB" }),
    ).toBeDisabled();
  });

  it("renders the url and a screenshot", () => {
    useBrowserStore.setState({
      url: "https://example.com",
      screenshotSrc:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN0uGvyHwAFCAJS091fQwAAAABJRU5ErkJggg==",
    });

    render(<BrowserPanel />);

    expect(screen.getByTestId("browser-chrome-url")).toHaveTextContent(
      "https://example.com",
    );
    expect(screen.getByAltText("BROWSER$SCREENSHOT_ALT")).toBeInTheDocument();
  });

  it("passes through non-PNG data URLs instead of double-prefixing them", () => {
    const screenshotSrc = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";

    useBrowserStore.setState({ url: "https://example.com", screenshotSrc });

    render(<BrowserPanel />);

    expect(screen.getByAltText("BROWSER$SCREENSHOT_ALT")).toHaveAttribute(
      "src",
      screenshotSrc,
    );
  });

  it("prefixes a bare base64 payload as PNG", () => {
    useBrowserStore.setState({
      url: "https://example.com",
      screenshotSrc: "iVBORw0KGgo=",
    });

    render(<BrowserPanel />);

    expect(screen.getByAltText("BROWSER$SCREENSHOT_ALT")).toHaveAttribute(
      "src",
      "data:image/png;base64,iVBORw0KGgo=",
    );
  });

  it("links out only for http(s) urls", () => {
    const screenshotSrc = "data:image/png;base64,iVBORw0KGgo=";

    useBrowserStore.setState({ url: "https://example.com/a", screenshotSrc });
    const { unmount } = render(<BrowserPanel />);
    expect(screen.getByTestId("browser-chrome-open-external")).toHaveAttribute(
      "href",
      "https://example.com/a",
    );
    unmount();

    useBrowserStore.setState({ url: "javascript:alert(1)", screenshotSrc });
    render(<BrowserPanel />);
    expect(
      screen.queryByTestId("browser-chrome-open-external"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "BUTTON$OPEN_IN_NEW_TAB" }),
    ).toBeDisabled();
    // The url is still shown as text.
    expect(screen.getByTestId("browser-chrome-url")).toHaveTextContent(
      "javascript:alert(1)",
    );
  });

  it("does not clear a preloaded screenshot when the browser tab first mounts", () => {
    const screenshotSrc =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN0uGvyHwAFCAJS091fQwAAAABJRU5ErkJggg==";

    useBrowserStore.setState({
      url: "https://example.com",
      screenshotSrc,
    });

    render(<BrowserPanel />);

    expect(useBrowserStore.getState().screenshotSrc).toBe(screenshotSrc);
    expect(screen.getByAltText("BROWSER$SCREENSHOT_ALT")).toBeInTheDocument();
    expect(
      screen.queryByText("BROWSER$NO_PAGE_LOADED"),
    ).not.toBeInTheDocument();
  });
});
