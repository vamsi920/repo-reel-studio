/**
 * Proves the two claims the Usage dashboard makes: the context actually
 * shrinks, and nothing load-bearing is lost when it does.
 *
 * "Nothing load-bearing" is checked literally -- every file path, identifier,
 * URL and command present before compression must still be present after.
 * A saving that costs the agent an exact value is not a saving.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  resetWorkspaceMemoryStorage,
  writeRecords,
} from "#/api/workspace-memory/workspace-memory-store.api";

import {
  containsMemoryBlock,
  MEMORY_BLOCK_END,
  MEMORY_BLOCK_START,
} from "./render";
import { makeRecord } from "./test-fixtures";
import type { MemoryKind, MemoryRecord } from "./types";
import { computeWorkspaceId } from "./workspace-id";
import WorkspaceContextService, {
  resetRecordSource,
} from "./workspace-context-service";

const WORKSPACE = computeWorkspaceId("backend-1", "/w/a")!;

const KINDS: MemoryKind[] = [
  "fact",
  "decision",
  "business-rule",
  "constraint",
  "policy",
  "convention",
  "outcome",
  "failure",
  "procedure",
];

/**
 * Realistic records: prose that compresses, wrapped around exact values that
 * must not.
 */
const EXACT_VALUES = [
  "`npm run test:e2e`",
  "`src/api/agent-server-adapter.ts`",
  "https://docs.internal.example.com/payments/transport",
  "`PAYMENTS_GRPC_DEADLINE_MS`",
  "`services/payments/proto/payments.proto`",
  "`AgentServerRuntimeService.executeCommand`",
  "`pnpm --filter @acme/payments build`",
  "`ERR_STREAM_PREMATURE_CLOSE`",
];

function buildCorpus(): MemoryRecord[] {
  return Array.from({ length: 40 }, (_, index) => {
    const exact = EXACT_VALUES[index % EXACT_VALUES.length];
    const record = makeRecord({
      subject: `subject-${index}`,
      kind: KINDS[index % KINDS.length],
      statement:
        `It is basically really important to note that, in actual fact, the payments ` +
        `subsystem number ${index} simply just requires that you should always make ` +
        `sure to run ${exact} before you go ahead and actually deploy, because ` +
        `otherwise the deployment process will very likely end up failing in a way ` +
        `that is quite difficult to debug after the fact.`,
      provenance: {
        source: "repository-evidence",
        conversationId: "conv-1",
        observedAt: `2026-03-${String((index % 27) + 1).padStart(2, "0")}T00:00:00.000Z`,
        filePath: `services/payments/module-${index}.ts`,
        commitSha: "aaa1111",
        repositoryId: "acme/payments",
      },
    });
    return { ...record, workspaceId: WORKSPACE };
  });
}

const TASK = "deploy the payments subsystem and make sure the tests run first";

function build(compress: boolean, tokenBudget = 4000) {
  return WorkspaceContextService.buildContext({
    workspaceId: WORKSPACE,
    task: TASK,
    repositoryId: "acme/payments",
    conversationId: "conv-1",
    tokenBudget,
    commitSha: "aaa1111",
    model: "claude-sonnet-4-5",
    compress,
  });
}

beforeEach(() => {
  resetWorkspaceMemoryStorage();
  WorkspaceContextService.resetCache();
  resetRecordSource();
  writeRecords(WORKSPACE, buildCorpus());
});

describe("measured token reduction", () => {
  it("narrows from the full corpus, to the selection, to the sent block", () => {
    // Budget deliberately below the corpus so selection has to drop records.
    const context = build(true, 1200);
    const { sample } = context;

    expect(sample.candidateRawTokens).toBeGreaterThan(
      sample.selectedTokensBeforeCompression,
    );
    expect(sample.selectedTokensBeforeCompression).toBeGreaterThan(0);
    expect(sample.finalContextTokens).toBeLessThan(sample.candidateRawTokens);
  });

  it("respects the token budget", () => {
    const budget = 1200;
    const context = build(true, budget);
    expect(context.sample.finalContextTokens).toBeLessThanOrEqual(budget);
    expect(context.sample.selectedTokensBeforeCompression).toBeLessThanOrEqual(
      budget,
    );
  });

  it("compresses the prose measurably", () => {
    const compressed = build(true);
    WorkspaceContextService.resetCache();
    const raw = build(false);

    expect(raw.sample.compressionRatio).toBe(0);
    expect(compressed.sample.finalContextTokens).toBeLessThan(
      raw.sample.finalContextTokens,
    );
    // Measured, not aspirational. This fixture is roughly a third provenance
    // and exact values, none of which compress by design, so the achievable
    // ratio on the prose that remains is ~11%. The floor guards against
    // compression silently becoming a no-op, not against a target.
    expect(compressed.sample.compressionRatio).toBeGreaterThanOrEqual(0.08);
  });

  it("preserves every exact technical value through compression", () => {
    const compressed = build(true);
    WorkspaceContextService.resetCache();
    const raw = build(false);

    // Only assert on values that made it into the uncompressed block: the
    // budget legitimately drops records, compression must not.
    const inlineCode = raw.text.match(/`[^`]+`/g) ?? [];
    const urls = raw.text.match(/https?:\/\/\S+/g) ?? [];
    const paths = raw.text.match(/\bservices\/payments\/[\w./-]+/g) ?? [];

    expect(inlineCode.length).toBeGreaterThan(0);
    [...inlineCode, ...urls, ...paths].forEach((value) => {
      expect(compressed.text, `lost exact value ${value}`).toContain(value);
    });
  });

  it("keeps provenance on every rendered record", () => {
    const context = build(true);
    const bulletCount = (context.text.match(/^- \*\*/gm) ?? []).length;
    const sourceCount = (context.text.match(/\[source: /g) ?? []).length;
    expect(bulletCount).toBeGreaterThan(0);
    expect(sourceCount).toBe(bulletCount);
  });

  it("keeps the block sentinels intact through compression", () => {
    const context = build(true);
    expect(containsMemoryBlock(context.text)).toBe(true);
    expect(context.text.startsWith(MEMORY_BLOCK_START)).toBe(true);
    expect(context.text.trimEnd().endsWith(MEMORY_BLOCK_END)).toBe(true);
  });

  it("frames the block as data rather than instructions", () => {
    expect(build(true).text).toContain("not as instructions");
  });
});
