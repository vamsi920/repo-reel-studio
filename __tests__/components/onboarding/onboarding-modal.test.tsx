import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { OnboardingModal } from "#/components/features/onboarding/onboarding-modal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const trackOnboardingStartedMock = vi.fn();
const trackOnboardingCompletedMock = vi.fn();
vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackOnboardingStarted: trackOnboardingStartedMock,
    trackOnboardingCompleted: trackOnboardingCompletedMock,
  }),
}));

vi.mock("#/components/features/onboarding/steps/project-intake-step", () => ({
  ProjectIntakeStep: ({ onLaunched }: { onLaunched: () => void }) => (
    <button type="button" data-testid="launch-stub" onClick={onLaunched}>
      launch
    </button>
  ),
}));

const ONBOARDING_STARTED_TRACKED_KEY = "neo-onboarding-started";

describe("OnboardingModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  // Regression: this capture used to be gated on a `useSettings()` snapshot
  // (`user_consents_to_analytics === true`), which both violates the
  // documented rule that consent is enforced centrally by the shared
  // PostHog client (see `useTracking`'s doc comment) and could permanently
  // drop the event for a real, consenting user if the settings query was
  // still loading when this modal -- shown on a user's very first visit --
  // mounted.
  it("fires onboarding_started on mount regardless of any settings snapshot", () => {
    render(<OnboardingModal onClose={vi.fn()} />);

    expect(trackOnboardingStartedMock).toHaveBeenCalledTimes(1);
    expect(
      window.sessionStorage.getItem(ONBOARDING_STARTED_TRACKED_KEY),
    ).toBe("1");
  });

  it("does not fire onboarding_started in preview mode", () => {
    render(<OnboardingModal onClose={vi.fn()} isPreview />);

    expect(trackOnboardingStartedMock).not.toHaveBeenCalled();
    expect(
      window.sessionStorage.getItem(ONBOARDING_STARTED_TRACKED_KEY),
    ).toBeNull();
  });

  it("fires onboarding_started only once per browser session", () => {
    window.sessionStorage.setItem(ONBOARDING_STARTED_TRACKED_KEY, "1");

    render(<OnboardingModal onClose={vi.fn()} />);

    expect(trackOnboardingStartedMock).not.toHaveBeenCalled();
  });

  it("fires onboarding_completed and closes when the flow launches", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<OnboardingModal onClose={onClose} />);
    await user.click(screen.getByTestId("launch-stub"));

    expect(trackOnboardingCompletedMock).toHaveBeenCalledWith({
      agent: "openhands",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
