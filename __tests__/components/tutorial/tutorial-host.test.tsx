import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialHost } from "#/components/features/tutorial";
import {
  getCaptionDurationMs,
  TUTORIAL_MAX_CAPTION_MS,
  TUTORIAL_MIN_CAPTION_MS,
  TUTORIAL_PROGRESS_STORAGE_KEY,
  TUTORIAL_SEEN_STORAGE_KEY,
  useTutorialStore,
} from "#/components/features/tutorial/tutorial-store";
import {
  getTutorialSteps,
  MOBILE_MENU_TOGGLE_TEST_ID,
} from "#/components/features/tutorial/tutorial-steps";
import { TUTORIAL_LAUNCHER_TEST_ID } from "#/components/features/tutorial/tutorial-launcher";

// HeroUI's Tooltip (the real engine behind StyledTooltip) only mounts its
// content on real-DOM hover, which jsdom doesn't fire reliably, so stub it
// to surface the content as a marker element instead.
vi.mock("#/components/shared/buttons/styled-tooltip", () => ({
  StyledTooltip: ({
    content,
    children,
  }: {
    content: ReactNode;
    children: ReactNode;
  }) => (
    <>
      {children}
      <span data-testid="styled-tooltip-content">{content}</span>
    </>
  ),
}));
import {
  ONBOARDING_COMPLETED_EVENT,
  ONBOARDING_COMPLETED_STORAGE_KEY,
} from "#/components/features/onboarding/use-onboarding-completion";
import { NavigationProvider } from "#/context/navigation-context";
import { findTutorialAnchor } from "#/components/features/tutorial/tutorial-spotlight";
import {
  SidebarMobileNavProvider,
  useSidebarMobileNav,
} from "#/components/features/sidebar/sidebar-mobile-nav-context";

const { trackEvent, activeBackend, getSettings, searchConversations } =
  vi.hoisted(() => ({
    trackEvent: vi.fn(),
    activeBackend: { current: null as null | { backend: unknown } },
    getSettings: vi.fn(),
    searchConversations: vi.fn(),
  }));

vi.mock("#/contexts/active-backend-context", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/contexts/active-backend-context")>();
  return {
    ...actual,
    useActiveBackend: () => activeBackend.current ?? actual.useActiveBackend(),
  };
});

vi.mock("#/api/settings-service/settings-service.api", () => ({
  default: { getSettings },
}));

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({ default: { searchConversations } }),
);

vi.mock("#/services/telemetry", () => ({
  trackEvent,
  setTelemetryBackendContext: vi.fn(),
}));

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: { getSdkVersion: vi.fn().mockResolvedValue(null) },
}));

const navigate = vi.fn();

/** Exposes the mobile nav drawer's open/close controls and state for tests that need them. */
function MobileNavTestControls() {
  const { isOpen, open, close } = useSidebarMobileNav();
  return (
    <>
      <button type="button" data-testid="test-open-mobile-nav" onClick={open} />
      <button
        type="button"
        data-testid="test-close-mobile-nav"
        onClick={close}
      />
      <span data-testid="test-mobile-nav-state">
        {isOpen ? "open" : "closed"}
      </span>
    </>
  );
}

function renderHost() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NavigationProvider
        value={{
          currentPath: "/",
          conversationId: null,
          isNavigating: false,
          navigate,
        }}
      >
        <SidebarMobileNavProvider>
          <MobileNavTestControls />
          <TutorialHost />
        </SidebarMobileNavProvider>
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useTutorialStore.setState({ isOpen: false, stepIndex: 0, isPlaying: false });
  navigate.mockClear();
  trackEvent.mockClear();
  activeBackend.current = null;
});

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TutorialHost", () => {
  it("shows only the left-edge launcher to a returning user", () => {
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");

    renderHost();

    expect(screen.getByTestId("tutorial-launcher")).toBeInTheDocument();
    expect(screen.queryByTestId("tutorial-wizard")).not.toBeInTheDocument();
  });

  it("auto-starts once for a new user who just finished onboarding", () => {
    renderHost();
    expect(screen.queryByTestId("tutorial-wizard")).not.toBeInTheDocument();

    act(() => {
      window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
      window.dispatchEvent(new Event(ONBOARDING_COMPLETED_EVENT));
    });

    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "welcome",
    );
  });

  it("walks forward and back through steps, navigating to each step's page", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();

    await user.click(screen.getByTestId("tutorial-launcher"));
    expect(screen.queryByTestId("tutorial-back")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("tutorial-next"));
    const wizard = screen.getByTestId("tutorial-wizard");
    expect(wizard).toHaveAttribute("data-step", "conversations");
    expect(navigate).toHaveBeenCalledWith("/conversations");

    await user.keyboard("{ArrowRight}");
    expect(wizard).toHaveAttribute("data-step", "customize");

    await user.click(screen.getByTestId("tutorial-back"));
    expect(wizard).toHaveAttribute("data-step", "conversations");
  });

  it("opens the mobile nav drawer for a routed step so the real sidebar link is on screen, not just the hamburger fallback", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "closed",
    );

    await user.click(screen.getByTestId("tutorial-launcher"));
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "welcome",
    );
    // "welcome" has nothing to spotlight, so the drawer stays closed.
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "closed",
    );

    await user.click(screen.getByTestId("tutorial-next"));
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "conversations",
    );
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "open",
    );

    await user.click(screen.getByTestId("tutorial-next"));
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "customize",
    );
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "open",
    );
  });

  it("closes the mobile nav drawer once the tour ends, however it ends", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();

    await user.click(screen.getByTestId("tutorial-launcher"));
    await user.click(screen.getByTestId("tutorial-next"));
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "open",
    );

    await user.click(screen.getByTestId("tutorial-skip"));

    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "closed",
    );
  });

  it("covers the Security and Usage sidebar links added after the tour shipped", async () => {
    const user = userEvent.setup();
    const steps = getTutorialSteps();
    const securityIndex = steps.findIndex((s) => s.id === "security");
    const usageIndex = steps.findIndex((s) => s.id === "usage");

    expect(steps[securityIndex]).toMatchObject({
      route: "/security",
      anchorTestIds: ["sidebar-security-link", MOBILE_MENU_TOGGLE_TEST_ID],
    });
    expect(steps[usageIndex]).toMatchObject({
      route: "/usage",
      anchorTestIds: ["sidebar-usage-link", MOBILE_MENU_TOGGLE_TEST_ID],
    });
    // Security sits with the other top-level sidebar links, before the
    // Settings step; Usage sits with them too, still before Settings.
    const settingsIndex = steps.findIndex((s) => s.id === "settings");
    expect(securityIndex).toBeGreaterThan(0);
    expect(securityIndex).toBeLessThan(settingsIndex);
    expect(usageIndex).toBeGreaterThan(securityIndex);
    expect(usageIndex).toBeLessThan(settingsIndex);

    // Stand in for the real sidebar links so this exercises the actual
    // spotlight + mobile-drawer wiring for these two anchors specifically,
    // rather than relying on the generic "some routed step" coverage above.
    const securityLink = document.createElement("a");
    securityLink.dataset.testid = "sidebar-security-link";
    securityLink.getBoundingClientRect = () =>
      ({ top: 100, left: 10, width: 200, height: 32 }) as DOMRect;
    const usageLink = document.createElement("a");
    usageLink.dataset.testid = "sidebar-usage-link";
    usageLink.getBoundingClientRect = () =>
      ({ top: 260, left: 10, width: 200, height: 32 }) as DOMRect;
    document.body.append(securityLink, usageLink);

    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    act(() => {
      useTutorialStore.setState({ isOpen: true, stepIndex: securityIndex });
    });
    renderHost();

    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "security",
    );
    expect(navigate).toHaveBeenCalledWith("/security");
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "open",
    );
    expect(screen.getByTestId("tutorial-spotlight")).toHaveStyle({
      top: "96px",
      left: "6px",
      width: "208px",
    });

    await user.click(screen.getByTestId("tutorial-next"));
    for (let i = securityIndex + 1; i < usageIndex; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- steps must advance in order
      await user.click(screen.getByTestId("tutorial-next"));
    }
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "usage",
    );
    expect(navigate).toHaveBeenCalledWith("/usage");
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "open",
    );
    expect(screen.getByTestId("tutorial-spotlight")).toHaveStyle({
      top: "256px",
      left: "6px",
      width: "208px",
    });

    securityLink.remove();
    usageLink.remove();
  });

  it("finishing the last step closes the tour and remembers it was seen", async () => {
    const user = userEvent.setup();
    const lastIndex = getTutorialSteps().length - 1;
    act(() => {
      useTutorialStore.setState({ isOpen: true, stepIndex: lastIndex });
    });
    renderHost();

    await user.click(screen.getByTestId("tutorial-next"));

    expect(screen.queryByTestId("tutorial-wizard")).not.toBeInTheDocument();
    expect(screen.getByTestId("tutorial-launcher")).toBeInTheDocument();
    expect(
      window.localStorage.getItem(TUTORIAL_SEEN_STORAGE_KEY),
    ).not.toBeNull();
    expect(trackEvent).toHaveBeenCalledWith(
      "tutorial_completed",
      expect.objectContaining({ total_steps: lastIndex + 1 }),
    );
  });

  it("Escape skips the tour and it does not auto-start again", async () => {
    const user = userEvent.setup();
    const first = renderHost();
    act(() => {
      window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
      window.dispatchEvent(new Event(ONBOARDING_COMPLETED_EVENT));
    });

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("tutorial-wizard")).not.toBeInTheDocument();
    first.unmount();

    window.localStorage.removeItem(ONBOARDING_COMPLETED_STORAGE_KEY);
    renderHost();
    act(() => {
      window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
      window.dispatchEvent(new Event(ONBOARDING_COMPLETED_EVENT));
    });
    expect(screen.queryByTestId("tutorial-wizard")).not.toBeInTheDocument();
  });

  it("reopens an interrupted tour at the same step after a reload", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    const first = renderHost();
    await user.click(screen.getByTestId("tutorial-launcher"));
    await user.click(screen.getByTestId("tutorial-next"));
    await user.click(screen.getByTestId("tutorial-next"));
    first.unmount();
    act(() => {
      useTutorialStore.setState({ isOpen: false, stepIndex: 0 });
    });
    navigate.mockClear();

    renderHost();

    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "customize",
    );
    expect(navigate).toHaveBeenCalledWith("/customize");
    expect(useTutorialStore.getState().isPlaying).toBe(false);
    expect(trackEvent).toHaveBeenCalledWith(
      "tutorial_started",
      expect.objectContaining({ trigger: "resume" }),
    );
  });

  it("reports how far a user got when they skip, and forgets the position", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    await user.click(screen.getByTestId("tutorial-launcher"));
    await user.click(screen.getByTestId("tutorial-next"));

    await user.click(screen.getByTestId("tutorial-skip"));

    expect(trackEvent).toHaveBeenCalledWith(
      "tutorial_started",
      expect.objectContaining({ trigger: "launcher" }),
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "tutorial_skipped",
      expect.objectContaining({
        step: "conversations",
        step_index: 1,
        total_steps: getTutorialSteps().length,
      }),
    );
    expect(
      window.localStorage.getItem(TUTORIAL_PROGRESS_STORAGE_KEY),
    ).toBeNull();
  });

  it("shows the start label in a tooltip on the launcher", () => {
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();

    const launcher = screen.getByTestId(TUTORIAL_LAUNCHER_TEST_ID);
    expect(screen.getByTestId("styled-tooltip-content")).toHaveTextContent(
      launcher.getAttribute("aria-label") ?? "",
    );
  });

  it("returns focus to the launcher after finishing the tour", async () => {
    const user = userEvent.setup();
    const lastIndex = getTutorialSteps().length - 1;
    act(() => {
      useTutorialStore.setState({ isOpen: true, stepIndex: lastIndex });
    });
    renderHost();

    await user.click(screen.getByTestId("tutorial-next"));

    expect(screen.getByTestId(TUTORIAL_LAUNCHER_TEST_ID)).toHaveFocus();
  });

  it("returns focus to the launcher after skipping the tour", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    await user.click(screen.getByTestId("tutorial-launcher"));

    await user.click(screen.getByTestId("tutorial-skip"));

    expect(screen.getByTestId(TUTORIAL_LAUNCHER_TEST_ID)).toHaveFocus();
  });

  it("returns focus to the launcher after Escape closes the tour", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    await user.click(screen.getByTestId("tutorial-launcher"));

    await user.keyboard("{Escape}");

    expect(screen.getByTestId(TUTORIAL_LAUNCHER_TEST_ID)).toHaveFocus();
  });

  it("ignores Escape/arrow keys aimed at a blocking modal stacked on top of a running tour", async () => {
    // The wizard is non-modal, so a real modal (Manage Backends, Add
    // Backend, onboarding — anything using ModalBackdrop, which marks
    // itself aria-modal="true") can open on top of it. A keystroke meant to
    // close/navigate that modal (e.g. Escape on a non-input control inside
    // it, since text inputs are already excluded via isTypingTarget) must
    // not also skip or advance the tour underneath.
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    await user.click(screen.getByTestId("tutorial-launcher"));
    await user.click(screen.getByTestId("tutorial-next"));
    const wizard = screen.getByTestId("tutorial-wizard");
    expect(wizard).toHaveAttribute("data-step", "conversations");

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const modalButton = document.createElement("button");
    modalButton.type = "button";
    modal.append(modalButton);
    document.body.append(modal);
    modalButton.focus();

    fireEvent.keyDown(modalButton, { key: "Escape" });
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "conversations",
    );

    fireEvent.keyDown(modalButton, { key: "ArrowRight" });
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "conversations",
    );

    modal.remove();

    // Sanity check: the same keys still work once focus is back outside a
    // blocking modal, proving the guard is scoped and not a dead check.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "customize",
    );
  });

  it("keeps caption-bar text on fixed white-based colors instead of theme tokens", async () => {
    // The caption bar is a fixed black/white video-caption overlay,
    // independent of the active app color theme (default "deepsea" theme
    // resolves --oh-muted/--oh-border to dark colors meant for light
    // surfaces, which are unreadable against this bar's always-black
    // background). Regression test for that contrast bug.
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    await user.click(screen.getByTestId("tutorial-launcher"));

    const wizard = screen.getByTestId("tutorial-wizard");
    expect(wizard.className).not.toMatch(/--oh-border/);
    expect(wizard.className).toMatch(/border-white\/15/);

    const progress = screen.getByTestId("tutorial-progress");
    expect(progress.className).not.toMatch(/--oh-muted/);
    expect(progress.className).toMatch(/text-white\/60/);

    const skip = screen.getByTestId("tutorial-skip");
    expect(skip.className).not.toMatch(/--oh-muted/);
    expect(skip.className).toMatch(/text-white\/60/);
  });

  it("does not animate progress dots for users who prefer reduced motion", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    await user.click(screen.getByTestId("tutorial-launcher"));

    const dots = screen.getAllByTestId("tutorial-progress-dot");
    expect(dots.length).toBeGreaterThan(0);
    dots.forEach((dot) => {
      expect(dot.className).toMatch(/motion-reduce:transition-none/);
    });
  });

  it("hides the launcher while the mobile nav drawer is open", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    expect(screen.getByTestId("tutorial-launcher")).toBeInTheDocument();

    await user.click(screen.getByTestId("test-open-mobile-nav"));
    expect(screen.queryByTestId("tutorial-launcher")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("test-close-mobile-nav"));
    expect(screen.getByTestId("tutorial-launcher")).toBeInTheDocument();
  });

  it("falls back to the mobile menu toggle for the spotlight when the real sidebar link is off-screen", async () => {
    const user = userEvent.setup();
    const menuToggle = document.createElement("button");
    menuToggle.dataset.testid = MOBILE_MENU_TOGGLE_TEST_ID;
    menuToggle.getBoundingClientRect = () =>
      ({ top: 8, left: 8, width: 32, height: 32 }) as DOMRect;
    document.body.appendChild(menuToggle);
    act(() => {
      useTutorialStore.setState({ isOpen: true, stepIndex: 0 });
    });
    renderHost();

    await user.click(screen.getByTestId("tutorial-next"));

    expect(findTutorialAnchor([MOBILE_MENU_TOGGLE_TEST_ID])).toBe(menuToggle);
    const spotlight = screen.getByTestId("tutorial-spotlight");
    expect(spotlight).toHaveStyle({ top: "4px", left: "4px", width: "40px" });
    menuToggle.remove();
  });

  it("spotlights the on-screen sidebar item for the current step", async () => {
    const user = userEvent.setup();
    const link = document.createElement("a");
    link.dataset.testid = "sidebar-conversations-link";
    link.getBoundingClientRect = () =>
      ({ top: 100, left: 10, width: 200, height: 32 }) as DOMRect;
    document.body.appendChild(link);
    act(() => {
      useTutorialStore.setState({ isOpen: true, stepIndex: 0 });
    });
    renderHost();
    expect(screen.queryByTestId("tutorial-spotlight")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("tutorial-next"));

    const spotlight = screen.getByTestId("tutorial-spotlight");
    expect(spotlight).toHaveStyle({ top: "96px", left: "6px", width: "208px" });
    link.remove();
  });
});

describe("TutorialHost on a Cloud backend that skips onboarding", () => {
  function useReadyCloudAccount(conversationCount: number) {
    activeBackend.current = {
      backend: {
        id: "cloud-1",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "k",
        kind: "cloud",
      },
    };
    getSettings.mockResolvedValue({
      agent_settings: { llm: { model: "openhands/minimax-m2.7" } },
      llm_api_key_set: true,
    });
    searchConversations.mockResolvedValue({
      items: Array.from({ length: conversationCount }, (_, i) => ({
        id: `c${i}`,
      })),
      next_page_id: null,
    });
  }

  it("auto-starts the tour for a brand-new account", async () => {
    useReadyCloudAccount(0);

    renderHost();

    expect(await screen.findByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "welcome",
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "tutorial_started",
      expect.objectContaining({ trigger: "auto" }),
    );
  });

  it("leaves an account with conversation history alone", async () => {
    useReadyCloudAccount(2);

    renderHost();

    await waitFor(() => expect(searchConversations).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId("tutorial-wizard")).not.toBeInTheDocument();
    expect(screen.getByTestId("tutorial-launcher")).toBeInTheDocument();
  });
});

describe("TutorialHost watch mode", () => {
  it("auto-plays captions on a timer and stops on the last step", () => {
    vi.useFakeTimers();
    const steps = getTutorialSteps();
    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: steps.length - 2,
        isPlaying: true,
      });
    });
    renderHost();
    const wizard = screen.getByTestId("tutorial-wizard");

    act(() => {
      vi.advanceTimersByTime(TUTORIAL_MAX_CAPTION_MS);
    });
    expect(wizard).toHaveAttribute("data-step", "finish");
    expect(screen.getByTestId("tutorial-caption-timer")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TUTORIAL_MAX_CAPTION_MS);
    });
    expect(wizard).toHaveAttribute("data-step", "finish");
    expect(useTutorialStore.getState().isPlaying).toBe(false);
    expect(
      screen.queryByTestId("tutorial-caption-timer"),
    ).not.toBeInTheDocument();
  });

  it("pausing holds the current caption", () => {
    vi.useFakeTimers();
    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: 0,
        isPlaying: true,
      });
    });
    renderHost();

    fireEvent.click(screen.getByTestId("tutorial-play-toggle"));
    act(() => {
      vi.advanceTimersByTime(TUTORIAL_MAX_CAPTION_MS * 2);
    });

    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "welcome",
    );
  });

  it("starts paused for users who prefer reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({ matches: query.includes("reduce") }) as MediaQueryList,
    );

    act(() => useTutorialStore.getState().start());

    expect(useTutorialStore.getState()).toMatchObject({
      isOpen: true,
      isPlaying: false,
    });
  });

  it("sizes caption time to caption length within readable bounds", () => {
    expect(getCaptionDurationMs("Hi")).toBe(TUTORIAL_MIN_CAPTION_MS);
    expect(getCaptionDurationMs("x".repeat(1000))).toBe(
      TUTORIAL_MAX_CAPTION_MS,
    );
    expect(getCaptionDurationMs("x".repeat(100))).toBeGreaterThan(
      getCaptionDurationMs("x".repeat(60)),
    );
  });
});

describe("findTutorialAnchor", () => {
  it("skips hidden matches and falls back to the next test id", () => {
    const hidden = document.createElement("a");
    hidden.dataset.testid = "collapsed-settings-link";
    const visible = document.createElement("button");
    visible.dataset.testid = "user-menu-trigger";
    visible.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 40, height: 40 }) as DOMRect;
    const root = document.createElement("div");
    root.append(hidden, visible);

    expect(
      findTutorialAnchor(
        ["collapsed-settings-link", "user-menu-trigger"],
        root,
      ),
    ).toBe(visible);
  });
});
