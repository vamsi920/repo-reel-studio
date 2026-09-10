import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Logs in exactly like login-and-automations.spec.ts (same fixed boundary:
 * the test framework owns the credential, never an agent) and exports the
 * resulting session -- Supabase's JS client stores it in localStorage -- to
 * a local file outside the repo. The Neo hourly UI-testing agent loads that
 * file into a browser tab's localStorage and reloads, so it can explore the
 * app as an already-authenticated user without ever handling the password.
 *
 * Output path defaults to ~/.claude/neo-ui-tester/session-state.json;
 * override with QA_SESSION_OUTPUT_PATH. Re-run this before the exported
 * session expires (Supabase access tokens are short-lived; this captures
 * whatever the refresh token in localStorage is valid for).
 */

const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();
const outputPath =
  process.env.QA_SESSION_OUTPUT_PATH?.trim() ||
  `${process.env.HOME}/.claude/neo-ui-tester/session-state.json`;

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

test("logs in and exports the session for the UI-testing agent", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();

  await waitForPath(page, /\/conversations/, 30_000);
  await dismissAnalyticsModal(page);

  const origin = new URL(page.url()).origin;
  const localStorageEntries = await page.evaluate(() => ({ ...localStorage }));

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        origin,
        exportedAt: new Date().toISOString(),
        localStorage: localStorageEntries,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Session exported to ${outputPath} (origin: ${origin})`);
});
