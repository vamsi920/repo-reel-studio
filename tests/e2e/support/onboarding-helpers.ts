import { expect, type Page } from "@playwright/test";
import { APP_HOME_PATH } from "./app-paths";

export async function routeOnboardingLlmCatalog(page: Page) {
  await page.route("**/api/llm/models/verified", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: {
          anthropic: ["claude-opus-4-8"],
          openai: ["gpt-5.5"],
          openhands: ["claude-opus-4-5-20251101"],
        },
      }),
    });
  });

  await page.route("**/api/llm/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [
          "anthropic/claude-opus-4-8",
          "openai/gpt-5.5",
          "openhands/claude-opus-4-5-20251101",
        ],
      }),
    });
  });

  await page.route("**/api/llm/providers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        providers: ["anthropic", "openai", "openhands"],
      }),
    });
  });
}

type ShowOnboardingOptions = {
  apiKey: string;
  beforeGoto?: () => Promise<void>;
};

export async function showOnboarding(
  page: Page,
  { apiKey, beforeGoto }: ShowOnboardingOptions,
) {
  await page.addInitScript(
    ({ apiKey: initApiKey }) => {
      window.localStorage.removeItem("openhands-onboarded");
      window.localStorage.setItem("analytics-consent", "false");
      window.localStorage.setItem("openhands-telemetry-consent", "denied");
      window.localStorage.setItem("openhands-telemetry-first-use", "true");
      window.localStorage.setItem(
        "openhands-backends",
        JSON.stringify([
          {
            id: "default-local",
            name: "Local",
            host: window.location.origin,
            apiKey: initApiKey,
            kind: "local",
          },
        ]),
      );
      window.localStorage.setItem(
        "openhands-active-backend",
        JSON.stringify({ backendId: "default-local", orgId: null }),
      );
    },
    { apiKey },
  );

  await beforeGoto?.();
  await routeOnboardingLlmCatalog(page);
  await page.goto(APP_HOME_PATH, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByTestId("onboarding-modal"),
    "onboarding modal should appear for first-run users",
  ).toBeVisible({ timeout: 20_000 });
}
