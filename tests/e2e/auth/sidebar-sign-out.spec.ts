import { test, expect } from "@playwright/test";

/**
 * Regression test for the sidebar account menu: its trigger opened and then
 * immediately closed itself on the very click that opened it, because
 * `useClickOutsideElement` listened on `document`'s "click" event, which
 * still fired for the opening click despite the trigger's own
 * `stopPropagation()` call (see use-click-outside-element.ts). From the
 * user's side this looked exactly like "there is no sign-out button" -- the
 * dropdown never stayed open long enough to see or click "Sign out".
 */

const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();

test.skip(
  !email || !password,
  "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- see tests/e2e/auth/README.md",
);

test("sidebar account menu opens on click and offers sign out", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();
  await expect
    .poll(() => page.evaluate(() => window.location.pathname), {
      timeout: 30_000,
    })
    .toMatch(/\/conversations/);

  await page.getByTestId("user-menu-trigger").click();

  // Before the fix this never appeared -- the menu opened and closed within
  // the same click.
  await expect(page.getByTestId("sidebar-sign-out-button")).toBeVisible({
    timeout: 5_000,
  });

  // A genuine outside click should still close it.
  await page.mouse.click(700, 400);
  await expect(page.getByTestId("user-menu")).toHaveCount(0);
});
