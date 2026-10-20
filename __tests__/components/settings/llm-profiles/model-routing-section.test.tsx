import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import SettingsService from "#/api/settings-service/settings-service.api";
import { ModelRoutingSection } from "#/components/features/settings/llm-profiles/model-routing-section";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { recordFailure } from "#/lib/model-routing/health";
import { useModelRoutingStore } from "#/stores/model-routing-store";

const PROFILES = [
  {
    name: "pro",
    model: "gemini/gemini-2.5-pro",
    base_url: null,
    api_key_set: true,
  },
  {
    name: "flash",
    model: "gemini/gemini-2.5-flash",
    base_url: null,
    api_key_set: true,
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  useModelRoutingStore.setState({ health: {}, decisions: [] });
});

// @spec MR-018 — Model routing settings
describe("ModelRoutingSection", () => {
  it("saves Auto as the global default", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      DEFAULT_SETTINGS,
    );
    const save = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(undefined as never);
    renderWithProviders(<ModelRoutingSection profiles={PROFILES} canManage />);

    await userEvent.click(
      await screen.findByTestId("model-routing-default-auto"),
    );

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ model_routing_mode: "auto" }),
      ),
    );
  });

  it("excludes a profile from Auto when it is switched off", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      DEFAULT_SETTINGS,
    );
    const save = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(undefined as never);
    renderWithProviders(<ModelRoutingSection profiles={PROFILES} canManage />);

    await userEvent.click(
      await screen.findByTestId("model-routing-include-flash"),
    );

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ model_routing_excluded_profiles: ["flash"] }),
      ),
    );
  });

  it("shows a cooling-down profile and lets the user reset it", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      DEFAULT_SETTINGS,
    );
    useModelRoutingStore.setState({
      health: { pro: recordFailure(undefined, "rate_limit", Date.now()) },
    });
    renderWithProviders(<ModelRoutingSection profiles={PROFILES} canManage />);

    expect(screen.getByTestId("model-routing-health-pro")).toHaveTextContent(
      "MODEL_ROUTING$HEALTH_COOLING",
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "SETTINGS$MODEL_ROUTING_RESET_HEALTH",
      }),
    );
    expect(screen.getByTestId("model-routing-health-pro")).toHaveTextContent(
      "MODEL_ROUTING$HEALTH_HEALTHY",
    );
  });
});
