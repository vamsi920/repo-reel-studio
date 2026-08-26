import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies the fix for the empty "Open Repository" dropdown: previously
 * `invokeProxy` in `local-github-service.api.ts` swallowed every edge
 * function error into an empty page, so a signed-in user with GitHub
 * connected still saw zero repos with no error. See
 * tests/e2e/auth/README.md for why this logs in via the test framework
 * rather than an agent typing a password.
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

test("home launcher's repository picker shows real repos, not an empty list", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();

  await waitForPath(page, /\/conversations/, 30_000);
  await dismissAnalyticsModal(page);

  // There is no local-folder entry point on the home launcher any more --
  // only the GitHub repository picker.
  await expect(page.getByTestId("open-workspace-button")).toHaveCount(0);
  await page.getByTestId("open-repository-button").click();

  const dropdownInput = page.getByTestId("git-repo-dropdown");
  await expect(dropdownInput).toBeVisible({ timeout: 10_000 });
  await dropdownInput.click();

  const menu = page.getByTestId("git-repo-dropdown-menu");
  await expect(menu).toBeVisible({ timeout: 10_000 });

  // The regression this test guards: silently-swallowed proxy errors used
  // to render as an empty, no-error dropdown. Assert the real success
  // signal (at least one repo option) rather than just "no error text".
  await expect(page.getByTestId("dropdown-error")).toHaveCount(0);
  await expect(menu.locator("li")).not.toHaveCount(0, { timeout: 15_000 });
});
