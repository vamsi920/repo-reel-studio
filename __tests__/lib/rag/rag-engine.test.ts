// @vitest-environment node
// @spec RAG-003 — structure-aware chunking; RAG-004 citations; RAG-007 evaluation
import { describe, expect, it } from "vitest";

import { chunkCode, chunkDocument, chunkMarkdown } from "#/lib/rag/chunk";
import { citationCoverage, segmentAnswer } from "#/lib/rag/citations";
import { computeMetrics, firstHitRank } from "#/lib/rag/evaluate";
import { REDACTED, redactSecrets, versionHash } from "#/lib/rag/text";

const RUNBOOK = `# Payments

Intro about payments.

## Deploy

Run \`npm run deploy:payments\` from the main branch. Deploys need two approvals.

## Database

### Migrations

Migrations live in db/migrations and run on every deploy.

\`\`\`sh
# not a heading inside a fence
npm run migrate
\`\`\`
`;

describe("chunkMarkdown", () => {
  it("keeps the heading trail and never splits on a heading inside a code fence", () => {
    const chunks = chunkMarkdown(RUNBOOK, { targetTokens: 30 });

    const deploy = chunks.find((c) => c.content.includes("deploy:payments"));
    const migrations = chunks.find((c) => c.content.includes("db/migrations"));
    expect(deploy?.headingPath).toBe("Payments > Deploy");
    expect(migrations?.headingPath).toBe("Payments > Database > Migrations");
    const fenced = chunks.find((c) =>
      c.content.includes("# not a heading inside a fence"),
    );
    expect(fenced?.headingPath).toBe("Payments > Database > Migrations");
    expect(chunks.some((c) => c.headingPath.includes("not a heading"))).toBe(
      false,
    );
  });

  it("splits a long section into overlapping pieces under the same heading", () => {
    const body = Array.from(
      { length: 40 },
      (_, i) =>
        `Paragraph ${i} explains step ${i} of the release process in detail.`,
    ).join("\n\n");
    const chunks = chunkMarkdown(`# Release\n\n${body}`, {
      targetTokens: 80,
      overlapTokens: 10,
    });

    expect(chunks.length).toBeGreaterThan(3);
    expect(
      chunks.every((c) => c.headingPath === "Release" && c.tokens <= 110),
    ).toBe(true);
    expect(chunks.map((c) => c.content).join(" ")).toContain("Paragraph 39");
  });
});

describe("chunkCode", () => {
  it("cuts at top-level declarations and records the line range", () => {
    const source = [
      'import { db } from "./db";',
      "",
      "export function createUser(name: string) {",
      ...Array.from(
        { length: 30 },
        (_, i) => `  const step${i} = db.insert(name, ${i});`,
      ),
      "}",
      "",
      "export class Billing {",
      ...Array.from(
        { length: 30 },
        (_, i) => `  charge${i}() { return ${i}; }`,
      ),
      "}",
    ].join("\n");

    const chunks = chunkCode("src/users.ts", source, { targetTokens: 200 });

    const billing = chunks.find((c) =>
      c.content.startsWith("export class Billing"),
    );
    expect(billing?.headingPath).toMatch(/^src\/users\.ts:36-\d+$/);
    expect(
      chunks.find((c) => c.content.includes("createUser"))?.content,
    ).not.toContain("class Billing");
  });

  it("is picked by file extension", () => {
    expect(
      chunkDocument("a.py", "def run():\n    return 'a long enough body'\n")[0]
        .headingPath,
    ).toMatch(/^a\.py:/);
    expect(
      chunkDocument("a.md", "# T\n\nSome text that is long enough.")[0]
        .headingPath,
    ).toBe("T");
  });
});

describe("redactSecrets and versionHash", () => {
  it("removes tokens and keeps the key name of key=value secrets", () => {
    const { text, redacted } = redactSecrets(
      "Use ghp_abcdefghijklmnopqrstuvwxyz123456 or set password: hunter2hunter2 for staging.",
    );
    expect(redacted).toBe(2);
    expect(text).not.toContain("ghp_");
    expect(text).toContain(`password: ${REDACTED}`);
    const code =
      'api_key = os.environ.get("KEY")\nclient = Client(api_key=api_key)\ntoken: string = "placeholder"';
    expect(redactSecrets(code)).toEqual({ text: code, redacted: 0 });
  });

  it("hashes identical text identically and different text differently", () => {
    expect(versionHash("same")).toBe(versionHash("same"));
    expect(versionHash("same")).not.toBe(versionHash("same."));
  });
});

describe("citations", () => {
  it("marks citations that point at no supplied source", () => {
    const segments = segmentAnswer(
      "Deploy from main [1]. Needs two approvals [2][4].",
      2,
    );
    expect(segments.filter((s) => s.kind === "cite")).toEqual([
      { kind: "cite", n: 1, valid: true },
      { kind: "cite", n: 2, valid: true },
      { kind: "cite", n: 4, valid: false },
    ]);
    expect(
      citationCoverage("Deploy from main [1]. Nobody knows why this is.", 1),
    ).toBe(0.5);
  });
});

describe("evaluation", () => {
  it("finds the first passage containing the expected text and scores recall and MRR", () => {
    const passages = [
      { content: "Unrelated text about logging." },
      { content: "Deploys need two approvals from the payments team." },
    ];
    expect(firstHitRank(passages, "two approvals")).toBe(2);
    expect(firstHitRank(passages, "three approvals")).toBeNull();

    const metrics = computeMetrics([
      { id: "a", question: "q", expected: "e", rank: 1, topTitle: null },
      { id: "b", question: "q", expected: "e", rank: 2, topTitle: null },
      { id: "c", question: "q", expected: "e", rank: null, topTitle: null },
    ]);
    expect(metrics).toEqual({
      cases: 3,
      recallAt1: 0.333,
      recallAt3: 0.667,
      recallAt5: 0.667,
      mrr: 0.5,
    });
  });
});
