import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultTelemetryConsent } from "#/components/features/analytics/default-telemetry-consent";

const useActiveBackendMock = vi.fn();
const useSettingsMock = vi.fn();
const useBackendsHealthMock = vi.fn();
const saveSettingsMock = vi.fn();
const getLockedCloudHostMock = vi.fn();
const setTelemetryConsentMock = vi.fn();

vi.mock("#/api/agent-server-config", () => ({
  getLockedCloudHost: () => getLockedCloudHostMock(),
}));
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));
vi.mock("#/hooks/query/use-backends-health", () => ({
  useBackendsHealth: (...args: unknown[]) => useBackendsHealthMock(...args),
}));
vi.mock("#/hooks/mutation/use-save-settings", () => ({
  useSaveSettings: () => ({ mutateAsync: saveSettingsMock, isPending: false }),
}));
vi.mock("#/services/telemetry", () => ({
  setTelemetryConsent: (...args: unknown[]) => setTelemetryConsentMock(...args),
}));

const LOCAL = {
  id: "local",
  kind: "local",
  name: "Local",
  host: "http://localhost:12000",
};

const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

describe("DefaultTelemetryConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveSettingsMock.mockResolvedValue(undefined);
    getLockedCloudHostMock.mockReturnValue(null);
    useActiveBackendMock.mockReturnValue({ backend: LOCAL });
    useBackendsHealthMock.mockReturnValue({ local: { isConnected: true } });
  });

  it("turns analytics on for an unset preference without showing anything", async () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: null },
      isSuccess: true,
    });

    const { container } = render(<DefaultTelemetryConsent />);

    await waitFor(() =>
      expect(setTelemetryConsentMock).toHaveBeenCalledWith("granted"),
    );
    expect(saveSettingsMock).toHaveBeenCalledWith({
      user_consents_to_analytics: true,
    });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("telemetry-consent-form")).toBeNull();
  });

  it("leaves an explicit opt-out alone", async () => {
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: false },
      isSuccess: true,
    });

    render(<DefaultTelemetryConsent />);
    await settle();

    expect(saveSettingsMock).not.toHaveBeenCalled();
    expect(setTelemetryConsentMock).not.toHaveBeenCalled();
  });

  it("does nothing on Cloud backends, which manage consent themselves", async () => {
    useActiveBackendMock.mockReturnValue({
      backend: { ...LOCAL, kind: "cloud" },
    });
    useSettingsMock.mockReturnValue({
      data: { user_consents_to_analytics: null },
      isSuccess: true,
    });

    render(<DefaultTelemetryConsent />);
    await settle();

    expect(saveSettingsMock).not.toHaveBeenCalled();
  });
});
