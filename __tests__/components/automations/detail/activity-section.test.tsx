import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivitySection } from "#/components/features/automations/detail/activity-section";
import { I18nKey } from "#/i18n/declaration";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

describe("ActivitySection", () => {
  it('shows "Never" instead of the epoch date when last_triggered_at is the epoch placeholder', () => {
    // The automation service leaves `last_triggered_at` as an epoch
    // placeholder (e.g. "1970-01-01T00:00:00Z") for an automation that has
    // never run, the same convention `activity-log-item.tsx` and
    // `automation-run-insights.tsx` already guard against. A bare truthy
    // check used to let it through to `formatRelativeTime`, rendering
    // "Jan 1, 1970" here while the list view correctly showed "Never".
    render(
      <ActivitySection
        createdAt="2026-01-01T00:00:00Z"
        lastRunAt="1970-01-01T00:00:00Z"
      />,
    );

    expect(
      screen.getByText(I18nKey.AUTOMATIONS$DETAIL$TIME_NEVER),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument();
  });

  it("shows the relative time for a real last-run timestamp", () => {
    render(
      <ActivitySection
        createdAt="2026-01-01T00:00:00Z"
        lastRunAt="2026-06-01T00:00:00Z"
      />,
    );

    expect(
      screen.queryByText(I18nKey.AUTOMATIONS$DETAIL$TIME_NEVER),
    ).not.toBeInTheDocument();
  });

  it('shows "Never" when lastRunAt is null', () => {
    render(<ActivitySection createdAt="2026-01-01T00:00:00Z" lastRunAt={null} />);

    expect(
      screen.getByText(I18nKey.AUTOMATIONS$DETAIL$TIME_NEVER),
    ).toBeInTheDocument();
  });
});
