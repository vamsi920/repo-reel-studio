import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import EnvironmentRunbookScreen from "#/routes/environment-runbook";
import { buildEnvironmentBundle } from "#/lib/environment/bundle";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

vi.mock("#/hooks/query/use-environment-checks", () => ({
  useEnvironmentChecks: () => ({ data: [] }),
}));

vi.mock("#/hooks/query/use-environment-profile", () => ({
  useEnvironmentProfile: () => ({
    data: { mode: "saas", policy: {}, providers: {}, network: {} },
  }),
}));

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: [] }),
}));

vi.mock("#/hooks/query/use-environment-readiness", () => ({
  useEnvironmentReadiness: () => ({
    score: 100,
    blocking: [],
    degrading: [],
    unknown: [],
    byCapability: {},
    items: [],
  }),
}));

vi.mock("#/api/environment-service/environment-service.api", () => ({
  EnvironmentService: { handoffPacket: vi.fn() },
  EnvironmentServiceError: class EnvironmentServiceError extends Error {},
}));

vi.mock("#/lib/environment/bundle", () => ({
  buildEnvironmentBundle: vi.fn(),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(buildEnvironmentBundle).mockReset();
  vi.mocked(displayErrorToast).mockReset();
});

describe("Environment runbook export bundle", () => {
  it("shows an error toast instead of failing silently when the bundle can't be built", async () => {
    // `buildEnvironmentBundle` hashes the payload with `crypto.subtle`, which
    // rejects (rather than resolving) outside a secure context. Previously
    // this was an unhandled rejection: the button looked like it did nothing
    // and never re-enabled.
    vi.mocked(buildEnvironmentBundle).mockRejectedValue(
      new Error("crypto.subtle is unavailable"),
    );

    render(<EnvironmentRunbookScreen />);
    const user = userEvent.setup();
    const button = screen.getByTestId("export-environment-bundle");

    await user.click(button);

    await waitFor(() => expect(displayErrorToast).toHaveBeenCalledTimes(1));
    expect(button).not.toBeDisabled();
  });

  it("disables the export button while the bundle is being built", async () => {
    // jsdom has no real Blob-URL machinery; stub just enough of it for the
    // success path (download anchor + cleanup) to run without throwing.
    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    URL.revokeObjectURL = vi.fn();

    let resolveBundle!: () => void;
    vi.mocked(buildEnvironmentBundle).mockReturnValue(
      new Promise((resolve) => {
        resolveBundle = () =>
          resolve({
            bundleVersion: 1,
            profile: {} as never,
            readiness: {} as never,
            credentialSlots: [],
            checksum: "abc",
          });
      }),
    );

    render(<EnvironmentRunbookScreen />);
    const user = userEvent.setup();
    const button = screen.getByTestId("export-environment-bundle");

    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    resolveBundle();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
