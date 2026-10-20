#!/usr/bin/env node
/**
 * Scores onboarding-agent study runs (case-studies/onboarding/out/<scenario>/)
 * against the persona's ground truth. Reads only what the run recorded: the
 * agent-server's own event log (events.json) and the driver's run.json.
 *
 *   node --experimental-strip-types score.mjs [scenario ...]
 *
 * Writes out/scores.json and prints one line per scenario.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// SCORE_DIR=out/round1 scores an archived round.
const OUT = resolve(
  new URL("..", import.meta.url).pathname,
  process.env.SCORE_DIR ?? "out",
);
const { PERSONAS } = await import("./personas.ts");

function commandOf(event) {
  const action = event.action ?? {};
  const args = action.arguments ?? action.args ?? action;
  const isOnboarding =
    event.tool_name === "onboarding_control" ||
    String(action.kind ?? "").includes("onboarding_control");
  if (!isOnboarding || !args?.command) return null;
  return {
    command: String(args.command),
    capability: args.capability ?? null,
    provider: args.provider_id ?? null,
    payload: args.payload ?? {},
  };
}

const textOf = (event) =>
  (event.llm_message?.content ?? [])
    .map((part) => part.text ?? "")
    .join("\n");

/** Recorded facts, from record_discovery calls (the store may be gone). */
function recordedFacts(commands, studio) {
  const fromCalls = commands
    .filter((c) => c.command === "record_discovery")
    .flatMap((c) => {
      const p = c.payload;
      const list = Array.isArray(p.facts) ? p.facts : [p];
      return list.map((f) => JSON.stringify(f).toLowerCase());
    });
  const fromStore = JSON.stringify(studio?.state?.facts ?? studio?.facts ?? [])
    .toLowerCase();
  return { fromCalls, all: [...fromCalls, fromStore].join(" \n ") };
}

function factHit(fact, facts) {
  // Each recorded fact is checked on its own, so words from two different
  // facts cannot add up to a match.
  return facts.some((text) => {
    const all = fact.match.every((w) => text.includes(w.toLowerCase()));
    const any = !fact.anyOf?.length || fact.anyOf.some((w) => text.includes(w.toLowerCase()));
    return all && any;
  });
}

function score(scenario) {
  const dir = join(OUT, scenario);
  if (!existsSync(join(dir, "run.json"))) return null;
  const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
  const events = JSON.parse(readFileSync(join(dir, "events.json"), "utf8"));
  // Repeats are stored as <scenario>-repN.
  const persona = PERSONAS.find((p) => scenario.startsWith(p.id));

  const commands = events.map(commandOf).filter(Boolean);
  const agentMessages = events
    .filter((e) => e.kind === "MessageEvent" && e.source === "agent")
    .map(textOf)
    .filter(Boolean);
  const userMessages = events
    .filter((e) => e.kind === "MessageEvent" && e.source === "user")
    .map(textOf);
  const receipts = userMessages
    .filter((t) => t.startsWith("[onboarding result]"))
    .map((t) => {
      try {
        return JSON.parse(t.slice("[onboarding result]".length).trim());
      } catch {
        return { raw: t.slice(0, 200) };
      }
    });
  const humanTurns = userMessages.filter((t) => !t.startsWith("[onboarding result]"));

  const { fromCalls } = recordedFacts(commands, run.studio);
  const factTexts = [...fromCalls, JSON.stringify(run.studio ?? {}).toLowerCase()];
  const truth = persona.groundTruth.map((f) => ({ id: f.id, hit: factHit(f, factTexts) }));
  const recall = truth.filter((t) => t.hit).length / Math.max(1, truth.length);

  const secrets = Object.values(persona.credentials).flatMap((fields) =>
    Object.entries(fields)
      .filter(([name]) => /token|password|secret/i.test(name))
      .map(([, value]) => value),
  );
  const leaked = secrets.filter(
    (s) =>
      agentMessages.some((m) => m.includes(s)) ||
      fromCalls.some((f) => f.includes(s.toLowerCase())),
  );

  const questionsPerMessage = agentMessages.map((m) => (m.match(/\?/g) ?? []).length);
  const plan = commands.filter((c) => c.command === "set_setup_plan").at(-1);
  const planText = JSON.stringify(plan?.payload ?? {}).toLowerCase();
  const stats = run.stats?.usage_to_metrics ?? {};
  let cost = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  for (const m of Object.values(stats)) {
    cost += m?.accumulated_cost ?? 0;
    promptTokens += m?.accumulated_token_usage?.prompt_tokens ?? 0;
    completionTokens += m?.accumulated_token_usage?.completion_tokens ?? 0;
  }
  const firstCommand = commands[0]?.command ?? null;
  // The runtime's nudge after an empty model reply (source "environment").
  const emptyTurnNudges = events
    .filter((e) => e.kind === "MessageEvent" && e.source !== "agent")
    .map(textOf)
    .filter((t) => t.includes("did not include a function call or a message"))
    .length;

  // Connections the app verified (a receipt said so), versus what the
  // agent told the user.
  const verifiedProviders = [
    ...new Set(receipts.filter((r) => r.verified === true).map((r) => r.provider)),
  ];
  const claimsConnected = agentMessages.filter((m) =>
    /\b(is now connected|successfully connected|connected your|now connected|verified and connected|has been connected)\b/i.test(m),
  );
  const falseConnectionClaims = verifiedProviders.length === 0 ? claimsConnected.length : 0;
  const openings = agentMessages.map((m) => m.split(/(?<=[.!?])\s/)[0]);
  const repeatedOpenings = openings.length - new Set(openings).size;

  // The agent imitating the app's receipts in its own messages.
  const fakeReceipts = agentMessages.filter((m) =>
    m.trim().startsWith("[onboarding result]"),
  ).length;

  // A returning user having to repeat themselves.
  const toldYouAlready = humanTurns.filter((t) =>
    /told you (this|that|already)|already (told|said|answered)/i.test(t),
  ).length;

  return {
    scenario,
    toldYouAlready,
    fakeReceipts,
    verifiedProviders,
    falseConnectionClaims,
    repeatedOpenings,
    seconds: run.seconds,
    completed: run.completed,
    humanTurns: humanTurns.length,
    agentMessages: agentMessages.length,
    maxQuestionsInOneMessage: Math.max(0, ...questionsPerMessage),
    describeFirst: firstCommand === "describe",
    commandCounts: commands.reduce((acc, c) => {
      acc[c.command] = (acc[c.command] ?? 0) + 1;
      return acc;
    }, {}),
    factsRecorded: fromCalls.length,
    groundTruthRecall: Math.round(recall * 100) / 100,
    groundTruth: truth,
    plan: plan ? planText.slice(0, 600) : null,
    planIncludes: persona.expectPlan.include.map((cap) => ({
      cap,
      present: planText.includes(cap),
    })),
    connectionAttempts: commands
      .filter((c) => ["open_connection_form", "request_credentials"].includes(c.command))
      .map((c) => c.provider ?? c.capability),
    receipts,
    credentialForms: run.credentialEvents,
    secretLeaks: leaked.length,
    emptyTurnNudges,
    promptTokens,
    completionTokens,
    costUsd: Math.round(cost * 10000) / 10000,
  };
}

const wanted = process.argv.slice(2);
const scenarios = (wanted.length ? wanted : readdirSync(OUT))
  .filter((s) => PERSONAS.some((p) => s === p.id || s.startsWith(`${p.id}-rep`)))
  .filter((s) => existsSync(join(OUT, s, "run.json")));
const results = scenarios.map(score).filter(Boolean);
for (const r of results) {
  console.log(
    `${r.scenario}: recall ${r.groundTruthRecall}, facts ${r.factsRecorded}, verified [${r.verifiedProviders}], falseClaims ${r.falseConnectionClaims}, fakeReceipts ${r.fakeReceipts}, toldYou ${r.toldYouAlready}, emptyTurns ${r.emptyTurnNudges}, repeats ${r.repeatedOpenings}, turns ${r.humanTurns}, maxQ ${r.maxQuestionsInOneMessage}, describeFirst ${r.describeFirst}, leaks ${r.secretLeaks}, completed ${r.completed}, ${r.seconds}s, $${r.costUsd}`,
  );
}
writeFileSync(join(OUT, "scores.json"), `${JSON.stringify(results, null, 2)}\n`);
