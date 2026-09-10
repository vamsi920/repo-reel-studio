import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { UnsupportedTriggerBadge } from "#/components/features/automations/unsupported-trigger-badge";
import { I18nKey } from "#/i18n/declaration";

describe("UnsupportedTriggerBadge", () => {
  it("renders the badge label and testid", () => {
    render(<UnsupportedTriggerBadge />);

    expect(
      screen.getByText(I18nKey.AUTOMATIONS$UNSUPPORTED_TRIGGER_BADGE),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("unsupported-trigger-badge"),
    ).toBeInTheDocument();
  });

  it("exposes the full explanation as a title tooltip", () => {
    render(<UnsupportedTriggerBadge />);

    expect(screen.getByTestId("unsupported-trigger-badge")).toHaveAttribute(
      "title",
      I18nKey.AUTOMATIONS$UNSUPPORTED_TRIGGER_WARNING,
    );
  });
});
