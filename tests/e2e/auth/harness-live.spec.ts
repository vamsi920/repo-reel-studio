import { test, expect, type Page } from "@playwright/test";

/**
 * Live (real LLM) check of the NeoDevEx agent harness: a fresh conversation
 * is asked to do independent work at once, and the thinking graph must split
 * into parallel branches and sub-agent lanes with their own live steps.
 * Costs real tokens, so it only runs with E2E_LIVE_HARNESS=1, normally
 * against a local stack (E2E_BASE_URL=http://localhost:8000).
 */

const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();

test.skip(
  !email || !password || process.env.E2E_LIVE_HARNESS !== "1",
  "needs E2E_TEST_EMAIL / E2E_TEST_PASSWORD and E2E_LIVE_HARNESS=1",
);

const PROMPT =
  "Harness check, read-only, keep it short. " +
  "Step 1: in ONE response run these three independent terminal commands " +
  "at the same time: `uname -a`, `date -u`, `echo $HOME`. " +
  "Step 2: in ONE response delegate two tasks to sub-agents so they run in " +
  "parallel: neo-explorer — 'list the files in /etc whose names start with " +
  "h, using ls only'; neo-explorer — 'count the files in /usr/bin with " +
  "ls | wc -l'. Step 3: reply with a one-paragraph summary.";

async function dismiss(page: Page, testId: string, button: string) {
  try {
    const form = page.getByTestId(testId);
    await form.waitFor({ state: "visible", timeout: 5_000 });
    await form.getByRole("button", { name: button }).click();
  } catch {
    // Not shown — fine.
  }
}

test("a real run splits into parallel branches and live sub-agent lanes", async ({
  page,
}) => {
  test.setTimeout(10 * 60_000);
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
  await dismiss(page, "telemetry-consent-form", "Confirm preferences");
  try {
    const skip = page.getByRole("button", { name: "Skip for now" });
    await skip.waitFor({ state: "visible", timeout: 8_000 });
    await skip.click();
  } catch {
    // Project-intake prompt didn't appear.
  }
  // Give the one-time harness settings migration a moment to land.
  await page.waitForTimeout(3_000);

  await page.goto("/conversations");
  const input = page
    .getByTestId("home-chat-launcher")
    .getByTestId("chat-input");
  await input.click();
  await page.keyboard.type(PROMPT);
  await page
    .getByTestId("home-chat-launcher")
    .getByTestId("submit-button")
    .click();
  await expect
    .poll(() => page.evaluate(() => window.location.pathname), {
      timeout: 60_000,
    })
    .toMatch(/\/conversations\//);

  await expect(page.getByTestId("thinking-panel").first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(
    page.locator("[data-testid='thinking-node-fork']").first(),
  ).toBeVisible({
    timeout: 240_000,
  });
  await page.screenshot({ path: "test-results-auth/harness-fork.png" });
  await expect(
    page.locator("[data-testid='thinking-node-agent']").first(),
  ).toBeVisible({
    timeout: 240_000,
  });
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: "test-results-auth/harness-lanes.png" });

  // Wait for the turn to finish, then reopen the folded panel for a final look.
  await expect(page.getByText(/Thought through \d+ steps/).first()).toBeVisible(
    {
      timeout: 360_000,
    },
  );
  const toggle = page.getByTestId("thinking-panel-toggle").last();
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  await page.getByTestId("thinking-graph").last().getByText("Fit").click();
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: "test-results-auth/harness-final.png" });
  console.log("conversation:", page.url());
});
