import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Exploratory probe for the onboarding agent case study
 * (case-studies/onboarding): log in as the test account against a local
 * stack and record what the setup studio shows. Opt-in only.
 *
 *   ONBOARDING_STUDY=1 E2E_BASE_URL=http://localhost:8000 \
 *     node --env-file-if-exists=.env.test.local node_modules/.bin/playwright \
 *     test --config=playwright.auth.config.ts onboarding-study-probe
 */
const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();
test.skip(
  !email || !password || process.env.ONBOARDING_STUDY !== "1",
  "Opt-in: ONBOARDING_STUDY=1 plus E2E_TEST_EMAIL / E2E_TEST_PASSWORD",
);

const OUT = "case-studies/onboarding/out/probe";

test.setTimeout(180_000);
test("records the setup studio's starting state", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();
  await expect
    .poll(() => page.evaluate(() => window.location.pathname), {
      timeout: 30_000,
    })
    .not.toBe("/login");

  await page.goto("/environment/setup", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: `${OUT}/studio.png` });
  const visible: Record<string, boolean> = {};
  for (const id of [
    "environment-setup-unconfigured",
    "environment-setup-needs-llm",
    "environment-setup-cloud-unsupported",
    "environment-setup-start",
    "environment-setup",
    "telemetry-consent-form",
  ]) {
    visible[id] = await page.getByTestId(id).isVisible().catch(() => false);
  }
  console.log(JSON.stringify(visible));

  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message.slice(0, 300)}`));
  const skip = page.getByRole("button", { name: "Skip for now" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.screenshot({ path: `${OUT}/after-skip.png` });
  await page.getByTestId("environment-setup-begin").click();
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(10_000);
    await page.screenshot({ path: `${OUT}/after-begin-${i}.png` });
    console.log(i, page.url());
  }
  console.log(JSON.stringify(errors.slice(0, 15), null, 1));
});
