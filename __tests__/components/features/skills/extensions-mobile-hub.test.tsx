import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { ExtensionsMobileHub } from "#/components/features/skills/extensions-mobile-hub";
import translations from "#/i18n/translation.json";

// Resolve `t(...)` through `translation.json` in a switchable language so the
// hub's labels can be asserted as real user-facing text (they used to be
// hardcoded English regardless of the app language).
let mockLanguage = "en";

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...(actual as object),
    useTranslation: () => ({
      t: (key: string) => {
        const entry = (translations as Record<string, Record<string, string>>)[
          key
        ];
        return entry?.[mockLanguage] ?? entry?.en ?? key;
      },
      i18n: { language: mockLanguage, exists: () => false },
    }),
  };
});

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "OpenHands Cloud",
  host: "https://app.all-hands.dev",
  apiKey: "token",
  kind: "cloud",
};

function renderMobileHub(ui: ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ActiveBackendProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

describe("ExtensionsMobileHub", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
    mockLanguage = "en";
  });

  afterEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  it("renders the Plugins item as an enabled link", () => {
    renderMobileHub(<ExtensionsMobileHub />);

    const hub = screen.getByTestId("extensions-mobile-hub");
    const pluginsItem = within(hub).getByTestId("sidebar-extensions-/plugins");
    expect(pluginsItem).not.toHaveAttribute("aria-disabled");
  });

  it("renders the rail labels in English by default", () => {
    renderMobileHub(<ExtensionsMobileHub />);

    const hub = screen.getByTestId("extensions-mobile-hub");
    expect(
      within(hub).getByTestId("sidebar-extensions-/mcp"),
    ).toHaveTextContent("MCP Servers");
    expect(
      within(hub).getByTestId("sidebar-extensions-/skills"),
    ).toHaveTextContent("Skills");
    expect(
      within(hub).getByTestId("sidebar-extensions-/plugins"),
    ).toHaveTextContent("Plugins");
  });

  it("translates the rail labels when the app language is German", () => {
    mockLanguage = "de";

    renderMobileHub(<ExtensionsMobileHub />);

    const hub = screen.getByTestId("extensions-mobile-hub");
    expect(
      within(hub).getByTestId("sidebar-extensions-/mcp"),
    ).toHaveTextContent("MCP-Server");
    expect(
      within(hub).getByTestId("sidebar-extensions-/skills"),
    ).toHaveTextContent("Fähigkeiten");
  });

  describe("cloud backend", () => {
    it("renders the Skills item as an external link to {cloudHost}/settings/skills with the renamed label", () => {
      setRegisteredBackends([cloudBackend]);
      setActiveSelection({ backendId: cloudBackend.id });

      renderMobileHub(<ExtensionsMobileHub />);

      const hub = screen.getByTestId("extensions-mobile-hub");
      const skillsItem = within(hub).getByTestId("sidebar-extensions-/skills");
      expect(skillsItem.tagName).toBe("A");
      expect(skillsItem).toHaveAttribute(
        "href",
        "https://app.all-hands.dev/settings/skills",
      );
      expect(skillsItem).toHaveAttribute("target", "_blank");
      expect(skillsItem).toHaveAttribute("rel", "noopener noreferrer");
      expect(skillsItem).toHaveTextContent("Skills and Plugins");
    });

    it("hides the Plugins item", () => {
      setRegisteredBackends([cloudBackend]);
      setActiveSelection({ backendId: cloudBackend.id });

      renderMobileHub(<ExtensionsMobileHub />);

      const hub = screen.getByTestId("extensions-mobile-hub");
      expect(
        within(hub).queryByTestId("sidebar-extensions-/plugins"),
      ).not.toBeInTheDocument();
    });
  });
});
