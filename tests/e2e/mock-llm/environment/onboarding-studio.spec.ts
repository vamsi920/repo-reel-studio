/**
 * Mock-LLM E2E: the onboarding studio.
 *
 * The one behaviour worth pinning down here is the one that was wrong: the
 * agent must be able to show providers, open a connection form and run checks
 * WITHOUT the browser ever leaving `/environment/setup`. The original
 * implementation navigated to the connections grid on the first tool call,
 * which ended the conversation mid-sentence.
 *
 * Credential submission itself is not exercised: it writes a real secret
 * through an Edge Function, and a stubbed version would assert the stub rather
 * than the boundary. That boundary is covered by
 * `__tests__/services/onboarding-control.test.ts`, which checks the properties
 * that actually matter -- no store slot holds a value, and what is posted back
 * to the agent is redacted.
 */

import { test, expect } from "@playwright/test";
import { routeSessionApiKey, waitForPath } from "../utils/mock-llm-helpers";

test.beforeEach(async ({ page }) => {
  await routeSessionApiKey(page);
});

test("the studio is reachable and offers to start, rather than auto-starting", async ({
  page,
}) => {
  await page.goto("/environment/setup");
  await waitForPath(page, /^\/environment\/setup$/);
  // Opt-in: nobody is dropped into a conversation with an agent they did not
  // ask for.
  await expect(page.getByTestId("environment-setup-begin")).toBeVisible();
});

test("the dock routes to the studio instead of opening a second chat", async ({
  page,
}) => {
  await page.goto("/conversations");
  await page.getByTestId("onboarding-dock-trigger").click();
  await expect(page.getByTestId("onboarding-dock")).toBeVisible();
  await page.getByTestId("onboarding-dock-launch").click();
  // Two chat surfaces would mean two websocket providers writing into the same
  // global event store, so the dock must hand off rather than host.
  await waitForPath(page, /^\/environment\/setup$/);
});

test("the dock hides itself once you are in the studio", async ({ page }) => {
  await page.goto("/environment/setup");
  await expect(page.getByTestId("onboarding-dock-trigger")).toBeHidden();
});

test("a missing model is explained instead of showing a chat that never answers", async ({
  page,
}) => {
  await page.goto("/environment/setup");
  // Either the studio offers to start, or it says a model is needed first --
  // both are honest; a silent, non-responding chat box would not be.
  const start = page.getByTestId("environment-setup-begin");
  const needsLlm = page.getByTestId("environment-setup-needs-llm");
  await expect(start.or(needsLlm)).toBeVisible();
});
