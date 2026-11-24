import { describe, expect, it } from "vitest";

import { extractLearnings } from "#/lib/neo-brain/corrections";
import {
  MEMORY_BLOCK_END,
  MEMORY_BLOCK_START,
} from "#/lib/workspace-memory/markers";

const CONTEXT = { workspaceId: "ws_a", conversationId: "conv-1" };

function learn(message: string) {
  return extractLearnings(message, CONTEXT).map((learning) => ({
    layer: learning.layer,
    statement: learning.candidate.statement,
    needsReview: learning.needsReview,
  }));
}

describe("extractLearnings routes each correction to one layer", () => {
  it.each([
    ["Use pnpm, not npm.", "convention", "Use pnpm instead of npm."],
    [
      "From now on, use vitest instead of jest",
      "convention",
      "Use vitest instead of jest.",
    ],
    ["Never push directly to main.", "gate", "Never push directly to main."],
    [
      "Don't deploy without asking me first.",
      "gate",
      "Never deploy without asking me first.",
    ],
    [
      "We decided to use Postgres for the job queue.",
      "decision",
      "We decided to use Postgres for the job queue.",
    ],
    [
      "To test, run `pnpm vitest run`.",
      "skill",
      "To test, run `pnpm vitest run`.",
    ],
    [
      "Always run the linter before you commit.",
      "policy",
      "Always run the linter before you commit.",
    ],
    [
      "Going forward, keep API handlers under src/api/handlers.",
      "policy",
      "Keep API handlers under src/api/handlers.",
    ],
  ])("%s -> %s", (message, layer, statement) => {
    expect(learn(message)).toEqual([{ layer, statement, needsReview: false }]);
  });

  it("holds a correction of the agent for review instead of trusting it", () => {
    expect(
      learn("No, the payments service lives in services/billing, not api/."),
    ).toEqual([
      {
        layer: "fact",
        statement: "The payments service lives in services/billing, not api/.",
        needsReview: true,
      },
    ]);
  });

  it("treats an instruction after 'no,' as the user's own rule", () => {
    expect(learn("No, always use pnpm instead of npm here.")).toEqual([
      {
        layer: "convention",
        statement: "Use pnpm instead of npm here.",
        needsReview: false,
      },
    ]);
  });

  it("finds several learnings in one message and keeps each once", () => {
    const result = learn(
      "Thanks. Use pnpm, not npm.\nAlso never force-push to main. Use pnpm, not npm.",
    );
    expect(result.map((item) => item.layer)).toEqual(["convention", "gate"]);
  });

  it.each([
    ["a question", "Should we always use pnpm?"],
    ["a one-off request", "Please fix the failing login test."],
    ["a one-off don't", "Don't push yet, I want to look first."],
    ["hedged text", "I think we use Postgres for the queue."],
    ["a pleasantry", "No worries, that is totally fine by me."],
    [
      "a studio receipt",
      '[neotest result] {"always":"use pnpm instead of npm"}',
    ],
    [
      "a secret",
      "Always use the key sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c.",
    ],
  ])("learns nothing from %s", (_label, message) => {
    expect(learn(message)).toEqual([]);
  });

  it("never learns from the memory block Neo itself prepended", () => {
    const message = `${MEMORY_BLOCK_START}\nAlways use yarn instead of npm.\n${MEMORY_BLOCK_END}\n\nPlease fix the build.`;
    expect(learn(message)).toEqual([]);
  });

  it("keys a preference flip to the same subject so it supersedes", () => {
    const [first] = extractLearnings("Use pnpm instead of npm.", CONTEXT);
    const [flipped] = extractLearnings("Use npm instead of pnpm.", CONTEXT);
    expect(flipped.candidate.subject).toBe(first.candidate.subject);
    expect(flipped.key).not.toBe(first.key);
  });
});
