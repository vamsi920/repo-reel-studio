/**
 * Mock-LLM E2E test: first-run onboarding happy path.
 *
 * Onboarding is one question ("what are you building?"); the agent and model
 * are resolved in the background. With a working model configured, answering
 * it must launch a real conversation seeded with that brief:
 *
 *   - the browser navigates to the new conversation,
 *   - the onboarding modal closes and `openhands-onboarded` is persisted,
 *   - the agent answers through the mock LLM (the launch really reached it),
 *   - no error banner shows.
 */

import { test, expect } from "@playwright/test";
import {
  SESSION_API_KEY,
  routeSessionApiKey,
  waitForPath,
  getConversationIdFromURL,
  deleteConversation,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
  waitForNonUserMessageText,
  ensureMockLLMProfileViaAPI,
} from "../utils/mock-llm-helpers";
import { showOnboarding } from "../../support/onboarding-helpers";

const PROJECT_BRIEF = "A small todo app with a REST API";
const REPLY_TOKEN = "ONBOARDING_HAPPY_PATH_REPLY_OK";

test.describe.configure({ mode: "serial" });

test.describe("onboarding happy path", () => {
  const conversationIds = new Set<string>();

  test.afterEach(async ({ request }) => {
    for (const id of Array.from(conversationIds)) {
      try {
        await deleteConversation(request, id);
        conversationIds.delete(id);
      } catch {
        // best-effort
      }
    }
    try {
      await resetMockLLM(request);
    } catch {
      // best-effort
    }
  });

  test("answering the one question launches a conversation", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    // Turn 0 is padding: the agent-server makes an internal LLM call before
    // the agent's main loop starts (same pattern as the automation specs).
    await registerTrajectory(request, "onboarding-intake", [
      { text: "" },
      { text: REPLY_TOKEN },
    ]);
    await activateTrajectory(request, "onboarding-intake");
    await ensureMockLLMProfileViaAPI(request);

    await showOnboarding(page, {
      apiKey: SESSION_API_KEY,
      beforeGoto: () => routeSessionApiKey(page),
    });

    await test.step("describe the project and launch", async () => {
      await expect(
        page.getByTestId("onboarding-step-project-intake"),
      ).toBeVisible();
      await page.getByTestId("onboarding-project-input").fill(PROJECT_BRIEF);
      const submit = page.getByTestId("onboarding-project-submit");
      await expect(submit).toBeEnabled({ timeout: 15_000 });
      await submit.click();
    });

    await test.step("lands in the new conversation", async () => {
      await waitForPath(page, /\/conversations\/.+/, 30_000);
      conversationIds.add(getConversationIdFromURL(page));
      await expect(page.getByTestId("onboarding-modal")).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.localStorage.getItem("openhands-onboarded"),
          ),
        )
        .not.toBeNull();
    });

    await test.step("the agent answers through the configured model", async () => {
      await waitForNonUserMessageText(page, REPLY_TOKEN, 30_000);
      await expect(page.getByTestId("error-message-banner")).not.toBeVisible({
        timeout: 2_000,
      });
    });
  });
});
