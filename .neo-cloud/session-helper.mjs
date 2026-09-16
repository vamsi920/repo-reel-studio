// Shared Playwright session helper for cloud UI-testing routines.
//
// Fixed boundary (see tests/e2e/auth/README.md): the test framework owns the
// credential and drives the login — never an interactively-typed password.
// This file exports one function, `withSession`, that logs in once with real
// credentials from env and hands your callback a fully authenticated `page`
// to drive however that run's test plan needs. Screenshots you take can be
// read afterward with the Read tool (it can view images).
//
// Usage from a throwaway per-run script:
//   import { withSession } from "./session-helper.mjs";
//   await withSession(async (page, context) => {
//     await page.goto("/automations");
//     await page.screenshot({ path: ".neo-cloud/shots/automations.png" });
//     ...
//   });

import { chromium } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL?.trim() || "https://neo.neodevex.com";
const EMAIL = process.env.E2E_TEST_EMAIL?.trim();
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim();

if (!EMAIL || !PASSWORD) {
  console.error(
    "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — see tests/e2e/auth/README.md. " +
      "In the cloud sandbox these must come from the environment, never typed by the agent.",
  );
  process.exit(1);
}

async function dismissAnalyticsModal(page) {
  try {
    const form = page.getByTestId("telemetry-consent-form");
    await form.waitFor({ state: "visible", timeout: 5_000 });
    await form.getByRole("button", { name: "Confirm preferences" }).click();
    await form.waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    // Modal didn't appear, or already dismissed — fine either way.
  }
}

export async function withSession(callback) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  await page.goto("/login");
  await page.getByTestId("auth-email").fill(EMAIL);
  await page.getByTestId("auth-password").fill(PASSWORD);
  await page.getByTestId("auth-submit").click();

  await page
    .waitForURL(/\/conversations/, { timeout: 30_000 })
    .catch(() => {
      throw new Error(
        "Login did not reach /conversations within 30s — session/auth may be down. " +
          "Check ~/.neo-cloud/incidents.md before assuming this is a new bug.",
      );
    });
  await dismissAnalyticsModal(page);

  try {
    await callback(page, context);
  } finally {
    await context.close();
    await browser.close();
  }
}
