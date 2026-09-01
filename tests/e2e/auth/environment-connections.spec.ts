import { test, expect, type Page } from "@playwright/test";

/**
 * Regression test for the `/environment/connections` page: its "Connect"
 * buttons call a set of Edge Functions (`connections-oauth-start`,
 * `connections-set-credentials`, etc.) that shipped in the repo but were
 * never deployed to Supabase, so every click failed with "Failed to send a
 * request to the Edge Function" (a fetch-level failure, not an HTTP error --
 * the function simply didn't exist). See tests/e2e/auth/README.md for why
 * this uses real login instead of a person/agent typing credentials in.
 */

const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();

test.skip(
  !email || !password,
  "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- see tests/e2e/auth/README.md",
);

async function waitForPath(page: Page, pattern: RegExp, timeout = 30_000) {
  await expect
    .poll(() => page.evaluate(() => window.location.pathname).catch(() => ""), {
      timeout,
    })
    .toMatch(pattern);
}

test("GitHub connector's Connect button reaches the connections-oauth-start Edge Function", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();
  await waitForPath(page, /\/conversations/, 30_000);

  await page.goto("/environment/connections", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("environment-connections")).toBeVisible({
    timeout: 15_000,
  });

  // Read the Edge Function response inside the route handler itself, before
  // fulfilling it -- the app's own window.location.href navigation right
  // after fires too fast to read response.json() afterwards.
  let capturedStatus: number | null = null;
  let capturedBody: { authorizeUrl?: string } | null = null;
  await page.route("**/functions/v1/connections-oauth-start", async (route) => {
    const response = await route.fetch();
    capturedStatus = response.status();
    capturedBody = await response.json().catch(() => null);
    await route.fulfill({ response });
  });
  // The eventual redirect target isn't reachable/relevant to this test.
  await page.route("**/login/oauth/authorize**", (route) => route.abort());

  await page.getByTestId("connector-connect-github").click();

  // Before the fix this either never resolves (fetch fails client-side) or
  // resolves as a 404 from Supabase's function gateway. A real 200 with an
  // authorizeUrl means the function is deployed and executing.
  await expect.poll(() => capturedStatus, { timeout: 15_000 }).toBe(200);
  expect(typeof capturedBody?.authorizeUrl).toBe("string");
  expect(capturedBody?.authorizeUrl).toContain(
    "github.com/login/oauth/authorize",
  );
});
