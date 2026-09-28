import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialHost } from "#/components/features/tutorial";
import {
  TUTORIAL_SEEN_STORAGE_KEY,
  useTutorialStore,
} from "#/components/features/tutorial/tutorial-store";
import { getTutorialSteps } from "#/components/features/tutorial/tutorial-steps";
import {
  ONBOARDING_COMPLETED_EVENT,
  ONBOARDING_COMPLETED_STORAGE_KEY,
} from "#/components/features/onboarding/use-onboarding-completion";
import { NavigationProvider } from "#/context/navigation-context";
import { findTutorialAnchor } from "#/components/features/tutorial/tutorial-spotlight";

const navigate = vi.fn();

function renderHost() {
  return render(
    <NavigationProvider
      value={{
        currentPath: "/",
        conversationId: null,
        isNavigating: false,
        navigate,
      }}
    >
      <TutorialHost />
    </NavigationProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useTutorialStore.setState({ isOpen: false, stepIndex: 0 });
  navigate.mockClear();
});

afterEach(() => {
  window.localStorage.clear();
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
