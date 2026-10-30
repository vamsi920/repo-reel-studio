import { test, expect, type Page } from "@playwright/test";

/**
 * Demo rehearsal against the live app (production by default): every module
 * loads without an error, a chat gets a real answer from the agent, and Neo
 * Synth builds a model from a pasted requirements document. Login is done by
 * the test from env credentials, like login-and-automations.spec.ts (see
 * tests/e2e/auth/README.md).
 */

const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();

test.skip(
  !email || !password,
  "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- see tests/e2e/auth/README.md",
);

const MODULES = [
  "/conversations",
  "/skills",
  "/plugins",
  "/mcp",
  "/settings/llm",
  "/settings/agent",
  "/settings/app",
  "/settings/secrets",
  "/automations",
  "/automations/templates",
  "/security",
  "/environment",
  "/environment/setup",
  "/modernize",
  "/synth",
  "/usage",
  "/agentops",
  "/agentops/live",
  "/agentops/history",
  "/agentops/budgets",
  "/kt",
];

const CRASH_TEXT =
  /Something went wrong|Unexpected Application Error|Cannot read properties|is not a function/;

async function dismissAnalyticsModal(page: Page) {
  try {
    const form = page.getByTestId("telemetry-consent-form");
    await form.waitFor({ state: "visible", timeout: 4_000 });
    await form.getByRole("button", { name: "Confirm preferences" }).click();
    await form.waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    // Not shown.
  }
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();
  await expect
    .poll(() => page.evaluate(() => window.location.pathname).catch(() => ""), {
      timeout: 30_000,
    })
    .toMatch(/\/conversations/);
  await dismissAnalyticsModal(page);
}

test.describe.configure({ mode: "serial" });

test("every module loads without crashing", async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await login(page);
  const problems: string[] = [];
  for (const path of MODULES) {
    const before = pageErrors.length;
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await page.waitForTimeout(2_500);
    const text = await page.locator("body").innerText();
    if (CRASH_TEXT.test(text)) problems.push(`${path}: error text on page`);
    if (text.replace(/\s+/g, " ").trim().length < 80) {
      problems.push(`${path}: page is (nearly) empty`);
    }
    if (/OpenHands Agent/.test(text)) {
      problems.push(`${path}: shows the runtime name instead of Neo`);
    }
    const errors = pageErrors.slice(before);
    if (errors.length) problems.push(`${path}: ${errors.join(" | ")}`);
  }
  expect(problems).toEqual([]);
});

test("a chat gets a real answer from the agent", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  await page.goto("/conversations", { waitUntil: "domcontentloaded" });
  const input = page.getByTestId("chat-input");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.click();
  await page.keyboard.type(
    "Reply with the single word NEODEMOREADY in capital letters and nothing else. Do not run any tools.",
  );
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.location.pathname), {
      timeout: 60_000,
    })
    .toMatch(/\/conversations\/[0-9a-f-]+/);
  // The agent's answer (the user's own message contains the word too, so
  // wait for a second occurrence).
  await expect
    .poll(
      async () =>
        ((await page.locator("body").innerText()).match(/NEODEMOREADY/g) ?? [])
          .length,
      { timeout: 240_000, intervals: [3_000] },
    )
    .toBeGreaterThanOrEqual(2);
  await expect(page.locator("body")).not.toContainText(CRASH_TEXT);
});

test("Neo Synth builds a model from a pasted requirements document", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page);
  await page.goto("/synth", { waitUntil: "domcontentloaded" });
  await page.getByTestId("synth-pick-document").click();
  await page
    .getByTestId("synth-document-paste")
    .fill(
      [
        "BR-1: The system shall capture the following details for each customer: full name, email address and date of birth.",
        "BR-2: Each customer can have many orders.",
        "BR-3: The order total must be between 1 and 5,000.",
        "BR-4: Order status can be Pending, Paid, Shipped or Cancelled.",
        "Support contact: jane.doe@example.com",
      ].join("\n"),
    );
  await expect(page.getByTestId("synth-document-totals")).toContainText(
    "2 entities",
  );
  await page.getByTestId("synth-document-name").fill("Demo rehearsal BRD");
  await page.getByTestId("synth-document-start").click();
  await expect
    .poll(() => page.evaluate(() => window.location.pathname), {
      timeout: 90_000,
    })
    .toMatch(/\/synth\/sy_/);
  await expect(page.getByTestId("synth-documents")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("synth-coverage")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(CRASH_TEXT);
});
