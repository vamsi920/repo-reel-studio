import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PullRequestStatusBadge } from "#/components/features/automations/pull-requests/pull-request-status-badge";
import { I18nKey } from "#/i18n/declaration";

describe("PullRequestStatusBadge", () => {
  it.each([
    ["open", false, I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_OPEN],
    ["merged", false, I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_MERGED],
    ["closed", false, I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_CLOSED],
    // A closed draft has no "draft" concept on GitHub, so the state label wins.
    ["closed", true, I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_CLOSED],
  ] as const)(
    "labels a %s PR (isDraft=%s) as %s",
    (state, isDraft, expectedLabel) => {
      render(<PullRequestStatusBadge state={state} isDraft={isDraft} />);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    },
  );

  it("shows the draft label instead of 'open' for an open draft PR", () => {
    render(<PullRequestStatusBadge state="open" isDraft />);

    expect(
      screen.getByText(I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_DRAFT),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_OPEN),
    ).not.toBeInTheDocument();
  });
});
