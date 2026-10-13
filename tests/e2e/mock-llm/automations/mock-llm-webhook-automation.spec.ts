/**
 * Mock-LLM E2E test: create a webhook-triggered automation from the form,
 * send a signed test event from its detail page, and read the run's report.
 *
 * Covers the round-4 automation work end to end against the real stack
 * (bin/agent-canvas.mjs): the "When a webhook is called" trigger creates its
 * own custom webhook source, the detail page shows the URL and the one-time
 * signing secret, "Send test event" posts a correctly signed payload, the
 * automation service starts a run, and the run row shows the agent's final
 * report plus the delivery outcome read from its RESULT line. Limits are
 * saved through the agent-server settings block the automation guard reads.
 */

import { test, expect } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  waitForPath,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
  ensureMockLLMProfile,
} from "../utils/mock-llm-helpers";

const AUTOMATION_NAME = "Webhook E2E";
const REPORT_TEXT = "Webhook received and summarised";
const AUTOMATION_API_BASE = `${BACKEND_URL}/api/automation/v1`;
const AUTH = { "X-Session-API-Key": SESSION_API_KEY };

test.describe.configure({ mode: "serial" });

test.describe("mock-LLM webhook automation", () => {
  let automationId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterAll(async ({ request }) => {
    if (automationId) {
      const automation = await request
        .get(`${AUTOMATION_API_BASE}/${automationId}`, { headers: AUTH })
        .then((resp) => (resp.ok() ? resp.json() : null))
        .catch(() => null);
      await request
        .delete(`${AUTOMATION_API_BASE}/${automationId}`, { headers: AUTH })
        .catch(() => {});
      const hooks = await request
        .get(`${AUTOMATION_API_BASE}/webhooks`, { headers: AUTH })
        .then((resp) => (resp.ok() ? resp.json() : { webhooks: [] }))
        .catch(() => ({ webhooks: [] }));
      for (const hook of hooks.webhooks ?? []) {
        if (hook.source === automation?.trigger?.source) {
          await request
            .delete(`${AUTOMATION_API_BASE}/webhooks/${hook.id}`, {
              headers: AUTH,
            })
            .catch(() => {});
        }
      }
    }
    await resetMockLLM(request).catch(() => {});
  });

  test("creates a webhook automation, sends a test event and shows the run report", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await ensureMockLLMProfile(page);

    // Every response is the same final report, so the run gets it whether
    // or not an internal skill-analysis call consumes the first one.
    const report = `${REPORT_TEXT}.\nRESULT: FAILED test event only, nothing to deliver`;
    await registerTrajectory(request, "webhook-automation", [
      { text: report },
      { text: report },
      { text: report },
      { text: report },
    ]);
    await activateTrajectory(request, "webhook-automation");

    await routeSessionApiKey(page);
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    await test.step("create the automation with a webhook trigger", async () => {
      await page.getByTestId("automations-add-automation").click();
      await page.getByTestId("create-automation-name").fill(AUTOMATION_NAME);
      await page
        .getByTestId("create-automation-prompt")
        .fill("Summarise the webhook payload in one sentence.");
      await page.getByTestId("create-automation-run-when-webhook").click();
      await page.getByTestId("create-automation-submit").click();
      await waitForPath(page, /\/automations\/[0-9a-f-]{36}$/, 30_000);
      automationId = page.url().split("/").pop() ?? null;
    });

    await test.step("the detail page shows the URL and the one-time secret", async () => {
      await waitForTestId(page, "webhook-trigger-panel", 30_000);
      await expect(page.getByTestId("webhook-url")).toContainText(
        "/api/automation/v1/events/",
      );
      await expect(page.getByTestId("webhook-secret")).not.toBeEmpty();
      await expect(page.getByTestId("webhook-curl")).toContainText(
        "openssl dgst -sha256 -hmac",
      );
    });

    await test.step("limits are saved for the automation guard", async () => {
      await page.getByTestId("automation-limits-per-hour").fill("5");
      await page.getByTestId("automation-limits-save").click();
      await expect
        .poll(
          async () => {
            const settings = await request
              .get(`${BACKEND_URL}/api/settings`, { headers: AUTH })
              .then((resp) => resp.json());
            return settings.misc_settings?.automation_policies?.automations?.[
              automationId!
            ]?.max_runs_per_hour;
          },
          { timeout: 15_000 },
        )
        .toBe(5);
    });

    await test.step("a signed test event starts a run that reports back", async () => {
      await page.getByTestId("webhook-send-test").click();
      await expect
        .poll(
          async () => {
            const runs = await request
              .get(`${AUTOMATION_API_BASE}/${automationId}/runs`, {
                headers: AUTH,
              })
              .then((resp) => resp.json());
            return runs.runs?.[0]?.status ?? "none";
          },
          { timeout: 150_000, intervals: [2_000] },
        )
        .toBe("COMPLETED");

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("run-report").first()).toContainText(
        REPORT_TEXT,
        { timeout: 30_000 },
      );
      await expect(
        page.getByTestId("run-outcome-failed").first(),
      ).toBeVisible();
    });
  });
});
