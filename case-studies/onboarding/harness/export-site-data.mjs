#!/usr/bin/env node
/**
 * Copies what the published case study needs from the out/roundN folders into
 * case-studies/site/onboarding/data/: per-round scores and transcripts, and
 * the scenario suite. Every lab credential (even though they only open the
 * simulated bank) is replaced before anything is written.
 *
 *   node --experimental-strip-types case-studies/onboarding/harness/export-site-data.mjs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUT = join(ROOT, "out");
const DEST = resolve(ROOT, "../site/onboarding/data");
const { PERSONAS } = await import("./personas.ts");

const SECRETS = [
  ...new Set(
    PERSONAS.flatMap((p) =>
      Object.values(p.credentials).flatMap((fields) =>
        Object.entries(fields)
          .filter(([name]) => /token|password|secret|key/i.test(name))
          .map(([, value]) => value),
      ),
    ).concat(["nw-proxy-test-7731", "nwnexus-test-51aa"]),
  ),
];
const scrub = (text) =>
  SECRETS.reduce((acc, secret) => acc.split(secret).join("[lab token]"), text);

mkdirSync(DEST, { recursive: true });
const rounds = readdirSync(OUT).filter((d) => /^round\d+$/.test(d)).sort();
const summary = [];
for (const round of rounds) {
  const dir = join(OUT, round);
  if (!existsSync(join(dir, "scores.json"))) continue;
  const scores = JSON.parse(readFileSync(join(dir, "scores.json"), "utf8"));
  const transcripts = {};
  for (const s of scores) {
    const run = JSON.parse(readFileSync(join(dir, s.scenario, "run.json"), "utf8"));
    transcripts[s.scenario] = run.transcript;
  }
  // Receipts embed the test account's own connections (its real Jira Cloud
  // site, GitHub login); publish the metrics and receipt statuses only.
  const published = scores.map(({ receipts, credentialForms, ...metrics }) => ({
    ...metrics,
    receiptStatuses: receipts.map((r) => r.status ?? null),
  }));
  writeFileSync(join(DEST, `${round}-scores.json`), scrub(JSON.stringify(published, null, 2)));
  writeFileSync(join(DEST, `${round}-transcripts.json`), scrub(JSON.stringify(transcripts, null, 2)));
  summary.push({ round, scenarios: scores.map((s) => s.scenario) });
}
writeFileSync(
  join(DEST, "suite.json"),
  scrub(
    JSON.stringify(
      PERSONAS.map(({ credentials, ...persona }) => ({
        ...persona,
        credentials: Object.fromEntries(
          Object.entries(credentials).map(([provider, fields]) => [provider, Object.keys(fields)]),
        ),
      })),
      null,
      2,
    ),
  ),
);
console.log(JSON.stringify(summary));
