import { test, expect, type Page } from "@playwright/test";

/**
 * The chat page's live "Thinking Graph": an opened conversation renders the
 * agent's work as a growing node graph by default, Replay re-grows it, and the
 * Transcript toggle brings back the classic card list. Logs in via the test
 * framework (see tests/e2e/auth/README.md). Run against a local stack with
 * `E2E_BASE_URL=http://localhost:8000`; set `E2E_CONVERSATION_ID` to open a
 * specific conversation, otherwise the first one in the sidebar is used.
 */

const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();
const conversationId = process.env.E2E_CONVERSATION_ID?.trim();

test.skip(
  !email || !password,
  "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- see tests/e2e/auth/README.md",
);

async function dismissAnalyticsModal(page: Page) {
  try {
    const form = page.getByTestId("telemetry-consent-form");
    await form.waitFor({ state: "visible", timeout: 5_000 });
    await form.getByRole("button", { name: "Confirm preferences" }).click();
    await form.waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    // Modal didn't appear, or was already dismissed -- fine either way.
  }
}

test("a conversation renders as a live thinking graph with a transcript toggle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();
  await expect
    .poll(() => page.evaluate(() => window.location.pathname), {
      timeout: 30_000,
    })
    .not.toMatch(/\/login/);
  await dismissAnalyticsModal(page);
  await page.evaluate(() =>
    window.localStorage.removeItem("neodevex-chat-view-mode"),
  );

  if (conversationId) {
    await page.goto(`/conversations/${conversationId}`);
  } else {
    await page
      .locator(
        "[data-testid='conversation-card'], [data-testid='compact-conversation-row']",
      )
      .first()
      .click({ timeout: 20_000 });
  }
  await dismissAnalyticsModal(page);
  const skipIntake = page.getByRole("button", { name: "Skip for now" });
  try {
    await skipIntake.waitFor({ state: "visible", timeout: 8_000 });
    await skipIntake.click();
  } catch {
    // Project-intake prompt didn't appear -- fine.
  }

  // A finished turn's thinking panel is folded away under the answer; open it.
  const panelToggle = page.getByTestId("thinking-panel-toggle").last();
  await expect(panelToggle).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "test-results-auth/thinking-collapsed.png" });
  if ((await panelToggle.getAttribute("aria-expanded")) !== "true") {
    await panelToggle.click();
  }
  const graph = page.getByTestId("thinking-graph").last();
  await expect(graph).toBeVisible({ timeout: 30_000 });
  await expect(graph.locator(".tg-node").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(2_500);
  await graph.screenshot({ path: "test-results-auth/thinking-graph.png" });

  await graph.locator(".tg-node").last().click();
  await expect(page.getByTestId("thinking-graph-drawer")).toBeVisible();
  await page.screenshot({
    path: "test-results-auth/thinking-graph-drawer.png",
  });

  await graph.getByTestId("thinking-graph-replay").click();
  await page.waitForTimeout(1_800);
  await page.screenshot({
    path: "test-results-auth/thinking-graph-replay.png",
  });

  await page.getByTestId("chat-view-transcript").click();
  await expect(page.getByTestId("thinking-panel")).toHaveCount(0);
});
