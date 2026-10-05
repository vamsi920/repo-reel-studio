import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

const {
  trackEvent,
  activeBackend,
  getSettings,
  searchConversations,
  supabaseUser,
  updateUser,
} = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  activeBackend: { current: null as null | { backend: unknown } },
  getSettings: vi.fn(),
  searchConversations: vi.fn(),
  supabaseUser: {
    current: null as null | {
      id: string;
      is_anonymous: boolean;
      user_metadata: Record<string, unknown>;
    },
  },
  updateUser: vi.fn(),
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: supabaseUser.current ? { user: supabaseUser.current } : null,
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      updateUser,
    },
  },
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

function renderHost(initialPath = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui = (currentPath: string) => (
    <QueryClientProvider client={queryClient}>
      <NavigationProvider
        value={{
          currentPath,
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
    </QueryClientProvider>
  );
  const view = render(ui(initialPath));
  return {
    ...view,
    /** Simulates the URL changing via a real in-app link, not the wizard's own navigate(). */
    setPath: (path: string) => view.rerender(ui(path)),
  };
}

/** Index of the step just before step `id`. */
function stepBefore(id: string): number {
  return getTutorialSteps().findIndex((s) => s.id === id) - 1;
}

/** Clicks Next until the open tour reaches step `id`. */
async function advanceTo(id: string, user: ReturnType<typeof userEvent.setup>) {
  const target = getTutorialSteps().findIndex((s) => s.id === id);
  while (useTutorialStore.getState().stepIndex < target) {
    await user.click(screen.getByTestId("tutorial-next"));
  }
}

beforeEach(() => {
  window.localStorage.clear();
  useTutorialStore.setState({ isOpen: false, stepIndex: 0, isPlaying: false });
  navigate.mockClear();
  trackEvent.mockClear();
  activeBackend.current = null;
  supabaseUser.current = null;
  updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
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
    expect(wizard).toHaveAttribute("data-step", "commands");
    expect(navigate).toHaveBeenCalledWith("/conversations");

    await user.keyboard("{ArrowRight}");
    expect(wizard).toHaveAttribute("data-step", "ask");

    await user.click(screen.getByTestId("tutorial-back"));
    expect(wizard).toHaveAttribute("data-step", "commands");
  });

  it("announces both the title and subtitle through one atomic live region on every step change", async () => {
    // Only the subtitle carried aria-live before this fix, so a screen
    // reader announced the narration on Back/Next but silently dropped the
    // step's own title every time.
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();

    await user.click(screen.getByTestId("tutorial-launcher"));
    const liveRegion = screen.getByTestId("tutorial-step-live-region");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
    expect(liveRegion).toContainElement(
      screen.getByRole("heading", { level: 2 }),
    );
    expect(liveRegion).toContainElement(
      screen.getByTestId("tutorial-subtitle"),
    );

    await user.click(screen.getByTestId("tutorial-next"));
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "commands",
    );
    // Same live region instance keeps wrapping the now-updated content.
    expect(screen.getByTestId("tutorial-step-live-region")).toContainElement(
      screen.getByTestId("tutorial-subtitle"),
    );
  });

  it("announces the step progress count through its own live region", async () => {
    // The "N of M" count sits in the header row, outside the title/subtitle
    // live region, so it needs its own aria-live or a screen reader never
    // hears it change even though it updates on every step.
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();

    await user.click(screen.getByTestId("tutorial-launcher"));
    const progress = screen.getByTestId("tutorial-progress");
    expect(progress).toHaveAttribute("aria-live", "polite");
    expect(progress).toHaveAttribute("aria-atomic", "true");

    await user.click(screen.getByTestId("tutorial-next"));
    // Same node persists across the step change the count is meant to
    // announce, rather than being torn down and replaced unannounced.
    expect(screen.getByTestId("tutorial-progress")).toBe(progress);
    expect(progress).toHaveAttribute("aria-live", "polite");
    expect(progress).toHaveAttribute("aria-atomic", "true");
  });

  it("resyncs the tour when a real link navigates away from the active step's page", async () => {
    // The sidebar (and any other in-app link) stays clickable while the tour
    // is open. Walking away that way, rather than via Back/Next, must not
    // leave the caption narrating a page that's no longer on screen.
    const steps = getTutorialSteps();
    const conversationsIndex = steps.findIndex((s) => s.id === "ask");
    const securityIndex = steps.findIndex((s) => s.id === "agentops");
    const { setPath } = renderHost("/conversations");
    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: conversationsIndex,
      });
    });
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "ask",
    );

    act(() => {
      setPath("/agentops");
    });

    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "agentops",
    );
    expect(useTutorialStore.getState().stepIndex).toBe(securityIndex);
  });

  it("does not resync for a sub-page of the active step's own section", async () => {
    // Opening a specific conversation, or a run under AgentOps, is still the
    // same section the step is narrating — not a departure worth resyncing.
    const steps = getTutorialSteps();
    const conversationsIndex = steps.findIndex((s) => s.id === "ask");
    const { setPath } = renderHost("/conversations");
    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: conversationsIndex,
      });
    });
    navigate.mockClear();

    act(() => {
      setPath("/conversations/abc123");
    });

    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "ask",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not force-navigate away from a sub-page the tour is opened on top of", () => {
    const steps = getTutorialSteps();
    const settingsIndex = steps.findIndex((s) => s.id === "agentops");
    act(() => {
      useTutorialStore.setState({ isOpen: true, stepIndex: settingsIndex });
    });
    renderHost("/agentops/runs/abc");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("pauses auto-play instead of dragging the user back when they navigate somewhere the tour doesn't cover", () => {
    vi.useFakeTimers();
    const steps = getTutorialSteps();
    const conversationsIndex = steps.findIndex((s) => s.id === "ask");
    const { setPath } = renderHost("/conversations");
    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: conversationsIndex,
        isPlaying: true,
      });
    });

    act(() => {
      setPath("/oauth/device/verify");
    });

    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "ask",
    );
    expect(useTutorialStore.getState().isPlaying).toBe(false);

    // The auto-advance timer that would have fired is gone with it.
    act(() => {
      vi.advanceTimersByTime(TUTORIAL_MAX_CAPTION_MS);
    });
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "ask",
    );
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

    // In-page steps point at the home page itself, so the drawer stays shut.
    await user.click(screen.getByTestId("tutorial-next"));
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "commands",
    );
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "closed",
    );

    await advanceTo("customize", user);
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "open",
    );
  });

  it("closes the mobile nav drawer once the tour ends, however it ends", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();

    await user.click(screen.getByTestId("tutorial-launcher"));
    await advanceTo("customize", user);
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "open",
    );

    await user.click(screen.getByTestId("tutorial-skip"));

    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "closed",
    );
  });

  it("points the tip bubble at the in-page element the step is about", () => {
    const chatInput = document.createElement("div");
    chatInput.dataset.testid = "chat-input";
    chatInput.getBoundingClientRect = () =>
      ({ top: 100, left: 10, width: 200, height: 32 }) as DOMRect;
    document.body.append(chatInput);
    const askIndex = getTutorialSteps().findIndex((s) => s.id === "ask");
    act(() => {
      useTutorialStore.setState({ isOpen: true, stepIndex: askIndex });
    });

    renderHost();

    expect(navigate).toHaveBeenCalledWith("/conversations");
    expect(screen.getByTestId("tutorial-spotlight")).toHaveStyle({
      top: "96px",
      left: "6px",
      width: "208px",
    });
    // Beside the ring (padded right edge 214px + 14px gap), not docked.
    const wizard = screen.getByTestId("tutorial-wizard");
    expect(wizard).toHaveAttribute("data-placement", "right");
    expect(wizard).toHaveStyle({ left: "228px" });
    expect(screen.getByTestId("tutorial-bubble-arrow")).toBeInTheDocument();
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "closed",
    );
    chatInput.remove();
  });

  it("centers the tip over a dimmed page when the step has nothing to point at", () => {
    act(() => {
      useTutorialStore.setState({ isOpen: true, stepIndex: 0 });
    });

    renderHost();

    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-placement",
      "center",
    );
    expect(screen.getByTestId("tutorial-backdrop")).toBeInTheDocument();
    expect(
      screen.queryByTestId("tutorial-bubble-arrow"),
    ).not.toBeInTheDocument();
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
      "ask",
    );
    expect(navigate).toHaveBeenCalledWith("/conversations");
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
        step: "commands",
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

  it("returns focus to the launcher after skipping from a routed step that opened the mobile drawer", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    await user.click(screen.getByTestId("tutorial-launcher"));
    await advanceTo("customize", user);
    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "open",
    );

    await user.click(screen.getByTestId("tutorial-skip"));

    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "closed",
    );
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
    expect(wizard).toHaveAttribute("data-step", "commands");

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
      "commands",
    );

    fireEvent.keyDown(modalButton, { key: "ArrowRight" });
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "commands",
    );

    modal.remove();

    // Sanity check: the same keys still work once focus is back outside a
    // blocking modal, proving the guard is scoped and not a dead check.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "ask",
    );
  });

  it("keeps the tip bubble on fixed literal colors instead of theme tokens or remapped white", async () => {
    // The light theme remaps Tailwind's `white` to dark ink and --oh-*
    // tokens flip between themes, so the bubble must use literal colors or
    // its contrast changes with the theme behind it.
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    renderHost();
    await user.click(screen.getByTestId("tutorial-launcher"));

    const wizard = screen.getByTestId("tutorial-wizard");
    for (const element of [
      wizard,
      screen.getByTestId("tutorial-progress"),
      screen.getByTestId("tutorial-skip"),
      screen.getByTestId("tutorial-next"),
    ]) {
      expect(element.className).not.toMatch(/--oh-|\b(bg|text|border)-white\b/);
    }
  });

  it("explains each module with a couple of points, in a light bubble except a dark one for Security", () => {
    const steps = getTutorialSteps();
    expect(steps).toHaveLength(38);
    const moduleSteps = steps.filter(
      (s) => s.anchorTestIds?.length && s.id !== "finish",
    );
    moduleSteps.forEach((s) =>
      expect(s.pointKeys?.length).toBeGreaterThanOrEqual(2),
    );
    expect(steps.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        "customize",
        "automations",
        "security",
        "environment",
        "agentops",
        "knowledge",
        "usage",
        "settings",
      ]),
    );

    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: stepBefore("security"),
      });
    });
    renderHost();
    const wizard = screen.getByTestId("tutorial-wizard");
    expect(wizard).toHaveAttribute("data-tone", "light");
    expect(screen.getByTestId("tutorial-points").children).toHaveLength(2);

    fireEvent.click(screen.getByTestId("tutorial-next"));
    expect(wizard).toHaveAttribute("data-step", "security");
    expect(wizard).toHaveAttribute("data-tone", "dark");
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
    const customizeIndex = getTutorialSteps().findIndex(
      (s) => s.id === "customize",
    );
    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: customizeIndex - 1,
      });
    });
    renderHost();

    await user.click(screen.getByTestId("tutorial-next"));

    expect(findTutorialAnchor([MOBILE_MENU_TOGGLE_TEST_ID])).toBe(menuToggle);
    const spotlight = screen.getByTestId("tutorial-spotlight");
    expect(spotlight).toHaveStyle({ top: "4px", left: "4px", width: "40px" });
    menuToggle.remove();
  });

  it("spotlights the on-screen element for the current step", async () => {
    const user = userEvent.setup();
    const link = document.createElement("a");
    link.dataset.testid = "command-menu-trigger";
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

  it("re-measures the spotlight when the anchor's own box resizes, e.g. a sidebar collapse toggle", async () => {
    // Regression test: toggling the sidebar between expanded/collapsed
    // resizes the anchored nav row itself without firing a window `resize`
    // event, since it's a CSS/layout change scoped to the sidebar, not the
    // viewport. Only a ResizeObserver on the anchor element catches that.
    class ControllableResizeObserver {
      static callbacks: ResizeObserverCallback[] = [];

      private cb: ResizeObserverCallback;

      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }

      observe = () => {
        ControllableResizeObserver.callbacks.push(this.cb);
      };

      unobserve = () => {};

      disconnect = () => {
        ControllableResizeObserver.callbacks =
          ControllableResizeObserver.callbacks.filter((cb) => cb !== this.cb);
      };

      static fireAll() {
        ControllableResizeObserver.callbacks.forEach((cb) =>
          cb([], {} as ResizeObserver),
        );
      }
    }
    ControllableResizeObserver.callbacks = [];
    vi.stubGlobal("ResizeObserver", ControllableResizeObserver);

    const user = userEvent.setup();
    const link = document.createElement("a");
    link.dataset.testid = "command-menu-trigger";
    link.getBoundingClientRect = () =>
      ({ top: 100, left: 10, width: 200, height: 32 }) as DOMRect;
    document.body.appendChild(link);
    act(() => {
      useTutorialStore.setState({ isOpen: true, stepIndex: 0 });
    });
    renderHost();
    await user.click(screen.getByTestId("tutorial-next"));

    const spotlight = screen.getByTestId("tutorial-spotlight");
    expect(spotlight).toHaveStyle({ top: "96px", left: "6px", width: "208px" });

    // Simulate the sidebar collapsing: the same row shrinks to an icon-only
    // width, with no window resize/scroll event involved.
    link.getBoundingClientRect = () =>
      ({ top: 100, left: 10, width: 36, height: 32 }) as DOMRect;
    act(() => {
      ControllableResizeObserver.fireAll();
    });

    expect(spotlight).toHaveStyle({ top: "96px", left: "6px", width: "44px" });
    link.remove();
  });

  it("re-syncs the spotlight to the mobile menu toggle if the drawer is dismissed by something other than the tour (its own backdrop tap or close button)", async () => {
    // The tour opens the mobile drawer itself for a routed step, but the
    // drawer's own backdrop/close button can still dismiss it directly —
    // that's a real Sidebar.tsx affordance, independent of the tour. Once
    // that happens the real sidebar link is unmounted along with the
    // drawer, and neither a window resize/scroll nor the anchor's own
    // ResizeObserver fires for an element that's gone, so without a forced
    // re-lookup the ring would stay frozen over nothing instead of falling
    // back to the always-visible mobile menu toggle.
    const user = userEvent.setup();
    const link = document.createElement("a");
    link.dataset.testid = "sidebar-skills-link";
    link.getBoundingClientRect = () =>
      ({ top: 100, left: 10, width: 200, height: 32 }) as DOMRect;
    document.body.appendChild(link);
    const menuToggle = document.createElement("button");
    menuToggle.dataset.testid = MOBILE_MENU_TOGGLE_TEST_ID;
    menuToggle.getBoundingClientRect = () =>
      ({ top: 8, left: 8, width: 32, height: 32 }) as DOMRect;
    document.body.appendChild(menuToggle);
    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: stepBefore("customize"),
      });
    });
    renderHost();
    await user.click(screen.getByTestId("tutorial-next"));

    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "open",
    );
    expect(screen.getByTestId("tutorial-spotlight")).toHaveStyle({
      top: "96px",
      left: "6px",
      width: "208px",
    });

    // The real Sidebar unmounts the routed link along with the drawer once
    // it's closed; simulate that, then dismiss the drawer the same way its
    // own backdrop/close button would — not through Skip/Next/Escape.
    link.remove();
    await user.click(screen.getByTestId("test-close-mobile-nav"));

    expect(screen.getByTestId("test-mobile-nav-state")).toHaveTextContent(
      "closed",
    );
    // Still mid-tour on the same step throughout.
    expect(screen.getByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "customize",
    );
    expect(screen.getByTestId("tutorial-spotlight")).toHaveStyle({
      top: "4px",
      left: "4px",
      width: "40px",
    });

    link.remove();
    menuToggle.remove();
  });

  it("upgrades from the mobile menu toggle to the real sidebar link once it mounts, and keeps tracking it through a transform transition instead of freezing at either the fallback or a stale mid-transition rect", async () => {
    // Mirrors the real Sidebar.tsx behavior this regression targets: opening
    // the mobile drawer for the first routed step after a non-routed one is
    // a mount-then-CSS-transition two-step (mount off-screen via
    // `-translate-x-full`, then animate to `translate-x-0`), so the real
    // sidebar link can exist in the DOM — with a nonzero, but still
    // off-screen, rect — a beat after the always-visible hamburger fallback
    // was already found. Drive the spotlight's per-frame polling manually so
    // the test can assert each stage instead of just the end state.
    const queuedFrames: FrameRequestCallback[] = [];
    let nextFrameHandle = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      nextFrameHandle += 1;
      return nextFrameHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      queuedFrames.length = 0;
    });
    const runNextFrame = () => {
      const callback = queuedFrames.shift();
      if (callback) act(() => callback(0));
    };

    const menuToggle = document.createElement("button");
    menuToggle.dataset.testid = MOBILE_MENU_TOGGLE_TEST_ID;
    menuToggle.getBoundingClientRect = () =>
      ({ top: 8, left: 8, width: 32, height: 32 }) as DOMRect;
    document.body.appendChild(menuToggle);

    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: stepBefore("customize"),
      });
    });
    renderHost();
    // A plain fireEvent click (not userEvent) so nothing besides the
    // spotlight's own effect can enqueue a requestAnimationFrame call here.
    fireEvent.click(screen.getByTestId("tutorial-next"));

    // Frame 1 (synchronous, within the effect itself): only the fallback
    // exists, so the ring settles there for now, and polling continues
    // because the top-priority candidate hasn't been found yet.
    expect(screen.getByTestId("tutorial-spotlight")).toHaveStyle({
      top: "4px",
      left: "4px",
      width: "40px",
    });
    expect(queuedFrames.length).toBe(1);

    // The drawer's mount step: the real link now exists (nonzero rect) but
    // is still off-screen mid-transition, e.g. `-translate-x-full`.
    const link = document.createElement("a");
    link.dataset.testid = "sidebar-skills-link";
    link.getBoundingClientRect = () =>
      ({ top: 100, left: -292, width: 200, height: 32 }) as DOMRect;
    document.body.appendChild(link);
    runNextFrame();

    // Upgraded to the real link, but its CURRENT (mid-transition) rect —
    // not the fallback's, and not frozen there either: polling must keep
    // going to ride out the rest of the transition.
    expect(screen.getByTestId("tutorial-spotlight")).toHaveStyle({
      top: "96px",
      left: "-296px",
      width: "208px",
    });
    expect(queuedFrames.length).toBe(1);

    // The transform finishes settling on screen.
    link.getBoundingClientRect = () =>
      ({ top: 100, left: 10, width: 200, height: 32 }) as DOMRect;
    runNextFrame();

    expect(screen.getByTestId("tutorial-spotlight")).toHaveStyle({
      top: "96px",
      left: "6px",
      width: "208px",
    });

    link.remove();
    menuToggle.remove();
  });

  it("caps the caption bar's height and scrolls internally instead of clipping off-screen on short viewports", async () => {
    // The bar is `fixed`/`bottom-4` and grows upward with its content, so
    // with no height cap a long caption on a very short viewport (a
    // landscape phone, or heavy browser zoom) could push the progress/skip
    // row above `y=0` — a fixed element that tall doesn't scroll with the
    // page, so that content would be genuinely unreachable, not just
    // scrolled off. Capping height + internal scroll keeps every control
    // reachable regardless of viewport height.
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByTestId("tutorial-launcher"));

    const wizard = screen.getByTestId("tutorial-wizard");
    expect(wizard.className).toContain("max-h-[calc(100vh-2rem)]");
    expect(wizard.className).toContain("overflow-y-auto");
  });
});

describe("TutorialHost for a signed-in account", () => {
  function signIn(userMetadata: Record<string, unknown> = {}) {
    supabaseUser.current = {
      id: "user-1",
      is_anonymous: false,
      user_metadata: userMetadata,
    };
  }

  it("auto-starts on a first real sign-in, even on a browser that already saw the tour", async () => {
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    window.localStorage.setItem(TUTORIAL_SEEN_STORAGE_KEY, "1");
    signIn();

    renderHost();

    expect(await screen.findByTestId("tutorial-wizard")).toHaveAttribute(
      "data-step",
      "welcome",
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "tutorial_started",
      expect.objectContaining({ trigger: "sign_in" }),
    );
  });

  it("remembers on the account once the user skips it", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    signIn();
    renderHost();
    await screen.findByTestId("tutorial-wizard");

    await user.keyboard("{Escape}");

    expect(updateUser).toHaveBeenCalledWith({
      data: { neo_tour_completed_at: expect.any(String) },
    });
    expect(window.localStorage.getItem("neo-tutorial-seen:user-1")).toBe("1");
  });

  it("does not start for an account that already saw it on another browser", async () => {
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    signIn({ neo_tour_completed_at: "2026-10-01T00:00:00.000Z" });

    renderHost();

    await waitFor(() =>
      expect(window.localStorage.getItem(TUTORIAL_SEEN_STORAGE_KEY)).toBe("1"),
    );
    expect(screen.queryByTestId("tutorial-wizard")).not.toBeInTheDocument();
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

  it("shows the play/pause label in a tooltip, matching the icon button's accessible name", () => {
    act(() => {
      useTutorialStore.setState({
        isOpen: true,
        stepIndex: 0,
        isPlaying: true,
      });
    });
    renderHost();

    const toggle = screen.getByTestId("tutorial-play-toggle");
    expect(toggle).not.toHaveAttribute("title");
    expect(
      within(screen.getByTestId("tutorial-wizard")).getByTestId(
        "styled-tooltip-content",
      ),
    ).toHaveTextContent(toggle.getAttribute("aria-label") ?? "");

    fireEvent.click(toggle);
    expect(
      within(screen.getByTestId("tutorial-wizard")).getByTestId(
        "styled-tooltip-content",
      ),
    ).toHaveTextContent(toggle.getAttribute("aria-label") ?? "");
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
