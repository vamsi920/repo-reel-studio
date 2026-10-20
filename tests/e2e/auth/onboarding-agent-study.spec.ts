/* eslint-disable local/no-direct-agent-server-fetch -- the study harness reads the isolated study stack's event log as an outside observer, not as app code */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  personaById,
  type Persona,
} from "../../../case-studies/onboarding/harness/personas";

/**
 * Onboarding agent case study driver (case-studies/onboarding).
 *
 * Logs in as the dedicated test account (the framework owns the login, see
 * tests/e2e/auth/README.md), opens the environment setup studio on a LOCAL
 * stack, and plays one persona against the real onboarding agent: a user
 * simulator answers its questions from the persona sheet, and credential
 * forms the agent raises are filled with the persona's throwaway test values
 * for the simulated Northwind environment. Everything the agent did is read
 * back from the agent-server's own event log and saved under
 * case-studies/onboarding/out/<scenario>/.
 *
 * Opt-in only, never part of a normal run:
 *   ONBOARDING_STUDY=1 STUDY_SCENARIO=S1-northwind-bank \
 *   E2E_BASE_URL=http://localhost:8000 \
 *   node --env-file-if-exists=.env.test.local node_modules/.bin/playwright \
 *     test --config=playwright.auth.config.ts onboarding-agent-study
 */

const email = process.env.E2E_TEST_EMAIL?.trim();
const password = process.env.E2E_TEST_PASSWORD?.trim();
test.skip(
  !email || !password || process.env.ONBOARDING_STUDY !== "1",
  "Opt-in: ONBOARDING_STUDY=1 plus E2E_TEST_EMAIL / E2E_TEST_PASSWORD",
);

const SCENARIO = process.env.STUDY_SCENARIO ?? "S1-northwind-bank";
const AGENT_SERVER = process.env.STUDY_AGENT_SERVER ?? "http://127.0.0.1:18000";
const SIM_MODEL = process.env.STUDY_SIM_MODEL ?? "gemini-2.5-flash";
const OUT = join("case-studies/onboarding/out", SCENARIO);

const repoEnv = (name: string) =>
  readFileSync(".env", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "") ?? "";

const sessionKey = readFileSync(
  join(homedir(), ".openhands/agent-canvas/api-key.txt"),
  "utf8",
).trim();

interface AgentEvent {
  id: string;
  kind: string;
  source?: string;
  timestamp?: string;
  tool_name?: string;
  action?: Record<string, unknown>;
  llm_message?: { content?: { text?: string }[] };
}

async function agentServer(path: string) {
  // A call that hangs would stall the whole run silently; retry instead.
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(`${AGENT_SERVER}${path}`, {
        headers: { "X-Session-API-Key": sessionKey },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
      return await res.json();
    } catch (error) {
      if (attempt >= 4) throw error;
      console.log(`[study] retry ${path.split("?")[0]} (${String(error)})`);
    }
  }
}

async function deleteConversation(id: string) {
  await fetch(`${AGENT_SERVER}/api/conversations/${id}`, {
    method: "DELETE",
    headers: { "X-Session-API-Key": sessionKey },
  });
}

async function allEvents(conversationId: string): Promise<AgentEvent[]> {
  const items: AgentEvent[] = [];
  let pageId: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (pageId) query.set("page_id", pageId);

    const page = await agentServer(
      `/api/conversations/${conversationId}/events/search?${query}`,
    );
    items.push(...(page.items ?? []));
    pageId = page.next_page_id ?? null;
  } while (pageId);
  return items;
}

const textOf = (event: AgentEvent) =>
  (event.llm_message?.content ?? [])
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();

/** The onboarding_control command an action event carries, if any. */
function onboardingCommand(event: AgentEvent) {
  const action = event.action ?? {};
  const args = (action.arguments ?? action.args ?? action) as Record<
    string,
    unknown
  >;
  const isOnboarding =
    event.tool_name === "onboarding_control" ||
    String(action.kind ?? "").includes("onboarding_control");
  if (!isOnboarding) return null;
  return {
    command: String(args.command ?? ""),
    payload: (args.payload ?? {}) as Record<string, unknown>,
  };
}

async function waitForAgentToSettle(conversationId: string, page: Page) {
  let lastCount = -1;
  let stable = 0;
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const conversation = await agentServer(
      `/api/conversations/${conversationId}`,
    );

    const count = (await allEvents(conversationId)).length;
    const sheetOpen =
      (await page
        .getByTestId("credential-request-sheet")
        .isVisible()
        .catch(() => false)) || (await openConnectionCard(page)) !== null;
    const busy = conversation.execution_status === "running";
    if (!busy && count === lastCount) stable += 1;
    else stable = 0;
    lastCount = count;
    if (sheetOpen && !busy) return "credential";
    if (stable >= 3) return conversation.execution_status as string;

    await page.waitForTimeout(2_000);
  }
  return "timeout";
}

async function simulateUser(
  persona: Persona,
  transcript: { role: "agent" | "user"; text: string }[],
) {
  const key = repoEnv("VITE_GEMINI_API_KEY");
  const system = `${persona.brief}

You are role-playing this person in a chat with a setup assistant. Reply as them, in 1-3 short sentences, answering only what the assistant just asked. Do not volunteer everything you know at once. If the assistant only reports progress and asks nothing, reply briefly ("ok, go ahead" or similar). Never invent facts beyond your brief; if asked something your brief does not cover, say you don't know.`;
  const contents = transcript.map((turn) => ({
    role: turn.role === "agent" ? "user" : "model",
    parts: [{ text: turn.text }],
  }));
  // The simulator shares the Gemini quota with the agent; a 429 or 5xx is
  // retried after the delay rather than failing the whole scenario.
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${SIM_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (res.ok || (res.status !== 429 && res.status < 500)) break;
    console.log(`[study] simulator ${res.status}, retry ${attempt}`);
    await new Promise((done) => {
      setTimeout(done, 20_000 * attempt);
    });
  }
  if (!res?.ok) throw new Error(`user simulator -> ${res?.status}`);
  const body = await res.json();
  return String(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "ok").trim();
}

async function sendChat(page: Page, text: string) {
  const input = page.getByTestId("chat-input");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.click(ACTION_TIMEOUT);
  await page.keyboard.insertText(text);
  await page.getByTestId("submit-button").click(ACTION_TIMEOUT);
}

// Cards this run has already declined (no credentials in the persona). A
// declined card that stays on screen must not be picked up again, or the
// driver loops on it.
const declinedCards = new Set<string>();
const ACTION_TIMEOUT = { timeout: 15_000 };

/** An open workbench connection form (not an OAuth-only button), if any. */
async function openConnectionCard(page: Page) {
  const cards = page
    .locator('[data-testid^="workbench-connection-card-"][data-status="open"]')
    .filter({ has: page.locator("form") });
  const count = await cards.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    if (!(await card.isVisible().catch(() => false))) continue;
    const testId = (await card.getAttribute("data-testid")) ?? "";
    const providerId = testId.replace("workbench-connection-card-", "");
    if (declinedCards.has(providerId)) continue;
    return { card, providerId };
  }
  return null;
}

async function fillCredentialSheet(
  page: Page,
  persona: Persona,
  providerId: string | null,
) {
  const workbench = await openConnectionCard(page);
  if (workbench) {
    const values = persona.credentials[workbench.providerId];
    const form = workbench.card.locator("form");
    if (!values) {
      declinedCards.add(workbench.providerId);
      await form
        .getByRole("button", { name: /cancel/i })
        .first()
        .click(ACTION_TIMEOUT)
        .catch(() => {});
      return {
        providerId: workbench.providerId,
        where: "workbench",
        filled: false,
      };
    }
    for (const [name, value] of Object.entries(values)) {
      const field = form.locator(`[name="${name}"]`);

      if (await field.count())
        await field
          .first()
          .fill(value, ACTION_TIMEOUT)
          .catch(() => {});
    }
    await form
      .locator('button[type="submit"]')
      .click(ACTION_TIMEOUT)
      .catch(() => {});
    await expect
      .poll(() => workbench.card.getAttribute("data-status"), {
        timeout: 90_000,
      })
      .not.toMatch(/open|submitting/)
      .catch(() => {});
    return {
      providerId: workbench.providerId,
      where: "workbench",
      filled: true,
      status: await workbench.card
        .getAttribute("data-status")
        .catch(() => null),
    };
  }
  const sheet = page.getByTestId("credential-request-sheet");
  const values = providerId ? persona.credentials[providerId] : undefined;
  if (!values) {
    await sheet
      .getByTestId("credential-cancel")
      .click(ACTION_TIMEOUT)
      .catch(() => {});
    return { providerId, filled: false };
  }
  for (const [name, value] of Object.entries(values)) {
    const field = sheet.locator(`[name="${name}"]`);

    if (await field.count())
      await field
        .first()
        .fill(value, ACTION_TIMEOUT)
        .catch(() => {});
  }
  await sheet
    .getByTestId("credential-submit")
    .click(ACTION_TIMEOUT)
    .catch(() => {});
  await sheet.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
  return { providerId, filled: true };
}

test(`onboarding agent study: ${SCENARIO}`, async ({ page }) => {
  test.setTimeout(45 * 60_000);
  // No single browser call may wait forever: a card that re-renders between
  // a lookup and a read otherwise stalls the run with no output.
  page.setDefaultTimeout(20_000);
  // Traces would record the login form fill; never keep one.
  test.info().annotations.push({ type: "trace", description: "off" });
  const persona = personaById(SCENARIO);
  mkdirSync(OUT, { recursive: true });
  const started = Date.now();
  const stage = async (name: string) => {
    console.log(
      `[study] ${Math.round((Date.now() - started) / 1000)}s ${name}`,
    );
    await page
      .screenshot({ path: join(OUT, `stage-${name}.png`) })
      .catch(() => {});
  };

  page.on("console", (msg) => {
    if (msg.type() === "error")
      console.log(`[console] ${msg.text().slice(0, 240)}`);
  });
  page.on("pageerror", (err) =>
    console.log(`[pageerror] ${err.message.slice(0, 240)}`),
  );
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) console.log(`[nav] ${frame.url()}`);
  });
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email!);
  await page.getByTestId("auth-password").fill(password!);
  await page.getByTestId("auth-submit").click();
  try {
    await expect
      .poll(() => page.evaluate(() => window.location.pathname), {
        timeout: 90_000,
      })
      .not.toBe("/login");
  } catch (error) {
    await page.screenshot({ path: join(OUT, "login-failed.png") });
    throw error;
  }

  await stage("logged-in");
  // One active onboarding session per org: remove the previous scenario's
  // conversation so the studio abandons that session (its own stale-session
  // path) and offers a fresh start. The isolated stack holds nothing else.
  const previous = await agentServer("/api/conversations/search?limit=50");
  for (const item of previous.items ?? []) {
    await deleteConversation(item.id);
  }

  await page.goto("/environment/setup", { waitUntil: "domcontentloaded" });
  // The first-run "What are you building?" dialog mounts a moment after the
  // studio and covers it; dismiss it once it shows up.
  const skip = page.getByRole("button", { name: "Skip for now" });
  await skip.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await skip.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  }
  await stage("setup-page");
  const begin = page.getByTestId("environment-setup-begin");
  await begin.waitFor({ state: "visible", timeout: 60_000 });
  await stage("begin-visible");
  await begin.click({ noWaitAfter: true, timeout: 15_000 });
  await stage("begun");
  await page.getByTestId("environment-setup").waitFor({ timeout: 60_000 });
  await stage("studio");

  // The isolated stack holds only this study's conversations.
  const search = await agentServer(
    "/api/conversations/search?limit=1&sort_order=CREATED_AT_DESC",
  );
  const conversationId: string = search.items[0].id;

  const transcript: { role: "agent" | "user"; text: string }[] = [];
  const credentialEvents: unknown[] = [];
  let seen = 0;
  let lastProvider: string | null = null;
  let completed = false;
  let credentialAt = -1;

  for (let turn = 0; turn < persona.maxTurns && !completed; turn += 1) {
    const state = await waitForAgentToSettle(conversationId, page);
    console.log(`[study] turn ${turn} state=${state}`);

    const events = await allEvents(conversationId);
    const fresh = events.slice(seen);
    seen = events.length;
    for (const event of fresh) {
      const command = onboardingCommand(event);
      if (command) {
        const provider =
          (event.action as { provider_id?: unknown } | undefined)
            ?.provider_id ?? command.payload.provider_id;
        if (typeof provider === "string") lastProvider = provider;
        if (command.command === "complete_setup") completed = true;
      }
      if (event.kind === "MessageEvent" && event.source === "agent") {
        const text = textOf(event);
        if (text) transcript.push({ role: "agent", text });
      }
    }
    if (completed || state === "timeout" || state === "error") break;

    if (state === "credential" && events.length !== credentialAt) {
      credentialAt = events.length;
      const result = await fillCredentialSheet(page, persona, lastProvider);
      console.log(`[study] credential ${JSON.stringify(result)}`);
      await page
        .screenshot({ path: join(OUT, `credential-${turn}.png`) })
        .catch(() => {});
      credentialEvents.push(result);
      continue;
    }
    // A form still on screen with nothing new from the agent means the
    // agent is waiting on the user: answer it instead of looping.
    if (transcript.at(-1)?.role !== "agent") {
      // The agent went quiet without a question (e.g. waiting on a tool).
      transcript.push({ role: "agent", text: "(no message)" });
    }

    const reply = await simulateUser(persona, transcript);
    transcript.push({ role: "user", text: reply });

    await sendChat(page, reply);

    await page.waitForTimeout(3_000);
  }

  // ── Collect evidence ──────────────────────────────────────────────────
  const events = await allEvents(conversationId);
  const conversation = await agentServer(
    `/api/conversations/${conversationId}`,
  );
  const studio = await page.evaluate(() =>
    window.localStorage.getItem("openhands-onboarding-studio"),
  );
  await page.screenshot({ path: join(OUT, "studio.png"), fullPage: false });

  await page.goto("/environment/connections", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: join(OUT, "connections.png") });
  const connectionsText = await page
    .locator("main")
    .innerText()
    .catch(() => "");

  writeFileSync(
    join(OUT, "run.json"),
    `${JSON.stringify(
      {
        scenario: SCENARIO,
        conversationId,
        seconds: Math.round((Date.now() - started) / 1000),
        completed,
        executionStatus: conversation.execution_status,
        stats: conversation.stats ?? null,
        transcript,
        credentialEvents,
        studio: studio ? JSON.parse(studio) : null,
        connectionsText,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(OUT, "events.json"),
    `${JSON.stringify(events, null, 2)}\n`,
  );
});
