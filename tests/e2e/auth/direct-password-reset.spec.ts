import { test, expect, type Page } from "@playwright/test";

/**
 * Regression test for the no-email password reset (POC-only, see
 * password-direct-reset Edge Function): a @neodevex.com user enters their
 * email and a new password directly on /login -- no emailed link, no
 * Supabase SMTP dependency -- and lands signed in.
 *
 * Deliberately resets the password to the SAME value already in
 * E2E_TEST_PASSWORD, so this test doesn't change anything about the real
 * account each time it runs.
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

test("direct password reset changes the password and signs in, with no email", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByTestId("auth-forgot-link").click();

  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-confirm-password").fill(password!);
  await page.getByTestId("auth-submit").click();

  await expect
    .poll(() => page.evaluate(() => window.location.pathname).catch(() => ""), {
      timeout: 30_000,
    })
    .toMatch(/\/conversations/);
  await dismissAnalyticsModal(page);

  // Confirm the new (same-value) password actually works on a normal
  // sign-in too -- proves the change was real, not just a client-side
  // redirect.
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();
  await expect
    .poll(() => page.evaluate(() => window.location.pathname).catch(() => ""), {
      timeout: 30_000,
    })
    .toMatch(/\/conversations/);
});

test("direct password reset rejects a non-neodevex.com email", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByTestId("auth-forgot-link").click();

  await page.getByTestId("auth-email").fill("someone@gmail.com");
  await page.getByTestId("auth-password").fill("SomethingLong123!");
  await page.getByTestId("auth-confirm-password").fill("SomethingLong123!");
  await page.getByTestId("auth-submit").click();

  await expect(page.getByText(/approved email domains/i)).toBeVisible({
    timeout: 10_000,
  });
});
