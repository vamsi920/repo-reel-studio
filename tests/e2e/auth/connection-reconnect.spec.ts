import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end check of the connector health loop against the deployed app and
 * its real Edge Functions (see tests/e2e/auth/README.md for why this logs in
 * with test-account credentials instead of an agent typing them).
 *
 * 1. Denying consent at the provider lands the user back on the page and
 *    origin they started from, with the error surfaced -- not on production's
 *    `/environment/connections`. Exercises `connections-oauth-start` storing
 *    the origin and the real callback reading it back before the provider's
 *    answer.
 * 2. A connection the server has marked revoked shows the app-wide banner,
 *    and Reconnect restarts consent for that provider with this origin. The
 *    revoked row is injected by intercepting the `connections` REST read, so
 *    the test never touches a real token.
 */

const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();

test.skip(
  !email || !password,
  "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- see tests/e2e/auth/README.md",
);

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
}

test("denying consent returns to the page and origin the flow started from", async ({
  page,
  baseURL,
}) => {
  await login(page);
  await page.goto("/environment/connections", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("environment-connections")).toBeVisible({
    timeout: 15_000,
  });

  // Capture the authorize URL instead of visiting GitHub.
  let authorizeUrl: string | null = null;
  await page.route("**/login/oauth/authorize**", async (route) => {
    authorizeUrl = route.request().url();
    await route.abort();
  });

  // Only possible when this test account can still connect GitHub here.
  const connect = page.getByTestId("connector-connect-github");
  test.skip(
    !(await connect.isVisible().catch(() => false)),
    "GitHub already connected for the test account's org",
  );
  await connect.click();
  await expect.poll(() => authorizeUrl, { timeout: 15_000 }).not.toBeNull();

  const authorize = new URL(authorizeUrl!);
  const callback = new URL(authorize.searchParams.get("redirect_uri")!);
  callback.searchParams.set("state", authorize.searchParams.get("state")!);
  callback.searchParams.set("error", "access_denied");

  // Act: what GitHub does when the user clicks "Cancel".
  await page.unroute("**/login/oauth/authorize**");
  await page.goto(callback.toString());

  // Assert: back on the same origin and page; the receipt was consumed.
  await expect
    .poll(() => page.url(), { timeout: 20_000 })
    .toContain(`${new URL(baseURL!).origin}/environment/connections`);
  await expect(page.getByText("access_denied")).toBeVisible({
    timeout: 10_000,
  });
  await expect
    .poll(() => new URL(page.url()).searchParams.get("error"))
    .toBeNull();
});

test("a revoked connection raises the banner and Reconnect restarts consent", async ({
  page,
  baseURL,
}) => {
  await page.route("**/rest/v1/connections?**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const rows = (await response.json().catch(() => [])) as Record<
      string,
      unknown
    >[];
    const now = new Date().toISOString();
    const revoked = {
      id: "00000000-0000-0000-0000-00000000e2e1",
      org_id: rows[0]?.org_id ?? "00000000-0000-0000-0000-000000000000",
      capability: "source-control",
      provider_id: "github",
      instance_key: "default",
      display_name: "e2e",
      config: {},
      redacted_summary: {},
      requested_scopes: ["repo", "read:user"],
      granted_scopes: ["repo", "read:user"],
      status: "revoked",
      last_probe: null,
      last_probe_at: now,
      expires_at: null,
      created_by: null,
      created_at: now,
      updated_at: now,
    };
    await route.fulfill({
      response,
      json: [...rows.filter((row) => row.provider_id !== "github"), revoked],
    });
  });

  let startBody: Record<string, unknown> | null = null;
  await page.route("**/functions/v1/connections-oauth-start", async (route) => {
    startBody = route.request().postDataJSON();
    await route.fulfill({
      json: { authorizeUrl: `${baseURL}/e2e-authorize-stub` },
    });
  });
  await page.route("**/e2e-authorize-stub", (route) => route.abort());

  await login(page);
  const banner = page.getByTestId("connection-health-banner");
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toHaveAttribute("data-kind", "connection-reconnect");

  await page.getByTestId("connection-health-banner-reconnect").click();

  await expect.poll(() => startBody, { timeout: 15_000 }).not.toBeNull();
  expect(startBody).toEqual(
    expect.objectContaining({
      providerId: "github",
      appOrigin: new URL(baseURL!).origin,
    }),
  );
});
