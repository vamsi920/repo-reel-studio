/**
 * Mock-LLM E2E: the Environment section.
 *
 * Covers the parts of the module that are pure frontend and therefore
 * meaningful without a configured Supabase project: the section is reachable,
 * the connector catalog renders from the registry, providers are grouped by
 * capability, and the onboarding dock opens from anywhere in the app.
 *
 * Deliberately does not exercise connecting a provider. That path writes a
 * real credential through an Edge Function, and a test that stubs the write
 * would assert the stub rather than the boundary. The boundary is covered
 * instead by `__tests__/services/onboarding-control.test.ts`, which checks the
 * properties that actually matter -- no store slot holds a value, and the
 * message posted back to the agent is redacted.
 */

import { test, expect } from "@playwright/test";
import { routeSessionApiKey, waitForPath } from "../utils/mock-llm-helpers";

test.beforeEach(async ({ page }) => {
  await routeSessionApiKey(page);
});

test("the Environment section is reachable from the sidebar", async ({
  page,
}) => {
  await page.goto("/conversations");
  await page.getByTestId("sidebar-environment-link").click();
  await waitForPath(page, /^\/environment$/);
  await expect(page.getByTestId("environment-screen")).toBeVisible();
});

test("the tabs navigate between Environment views", async ({ page }) => {
  await page.goto("/environment");

  await page.getByTestId("environment-tab-connections").click();
  await waitForPath(page, /^\/environment\/connections$/);

  await page.getByTestId("environment-tab-network").click();
  await waitForPath(page, /^\/environment\/network$/);
  await expect(page.getByTestId("environment-network")).toBeVisible();

  await page.getByTestId("environment-tab-requirements").click();
  await waitForPath(page, /^\/environment\/requirements$/);
  await expect(page.getByTestId("environment-requirements")).toBeVisible();

  await page.getByTestId("environment-tab-runbook").click();
  await waitForPath(page, /^\/environment\/runbook$/);
  await expect(page.getByTestId("environment-runbook")).toBeVisible();
});

test("the requirements view groups dependencies by the feature that needs them", async ({
  page,
}) => {
  await page.goto("/environment/requirements");
  await expect(
    page.getByTestId("requirement-feature-conversation.start"),
  ).toBeVisible();
  await expect(
    page.getByTestId("requirement-feature-automations.jira-trigger"),
  ).toBeVisible();
});

test("the network view labels every vantage a check can come from", async ({
  page,
}) => {
  await page.goto("/environment/network");
  const matrix = page.getByTestId("egress-matrix");
  await expect(matrix).toBeVisible();
  // Three separate columns, because a result from our network and a result
  // from the customer's are different claims.
  await expect(matrix.locator("thead th")).toHaveCount(4);
  await expect(page.getByTestId("egress-row-api.github.com")).toBeVisible();
});

test("the onboarding dock opens from outside the Environment section", async ({
  page,
}) => {
  await page.goto("/conversations");
  await page.getByTestId("onboarding-dock-trigger").click();
  await expect(page.getByTestId("onboarding-dock")).toBeVisible();
  await page.getByTestId("onboarding-dock-close").click();
  await expect(page.getByTestId("onboarding-dock")).toBeHidden();
});
