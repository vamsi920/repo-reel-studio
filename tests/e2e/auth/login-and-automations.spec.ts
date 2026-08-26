import { test, expect, type Page } from "@playwright/test";

/**
 * Real login, against whatever E2E_BASE_URL points at (production by
 * default). This is the standard way to verify a logged-in flow without a
 * person or an agent typing credentials into a live session -- the test
 * framework owns the login, using credentials from env/CI secrets. See
 * tests/e2e/auth/README.md.
 */

const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();

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

async function waitForPath(page: Page, pattern: RegExp, timeout = 30_000) {
  await expect
    .poll(() => page.evaluate(() => window.location.pathname).catch(() => ""), {
      timeout,
    })
    .toMatch(pattern);
}

test("logs in and loads the Automations dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();

  // password-auth-form.tsx doesn't navigate itself -- login.tsx's effect
  // redirects to /conversations once the session status flips to "real".
  await waitForPath(page, /\/conversations/, 30_000);

  await page.goto("/automations", { waitUntil: "domcontentloaded" });
  await dismissAnalyticsModal(page);

  // The regression this suite exists for: a stale session key made this
  // page show "Failed to load automations" instead of loading. Assert the
  // success signal directly rather than just the absence of the error text,
  // since a slow/loading state would also lack that text.
  await expect(page.getByTestId("automations-add-automation")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Failed to load automations")).toHaveCount(0);
});
