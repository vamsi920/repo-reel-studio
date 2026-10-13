/**
 * The delivery contract appended to every automation prompt NeoDevEx runs.
 *
 * Benchmarked against Devin (case-studies/automations): an unattended run
 * edited the file, pushed a branch, then told the user it had "opened a pull
 * request" and linked GitHub's `/pull/new/<branch>` page, which is not a pull
 * request. The run was recorded as COMPLETED. Automation runs have nobody
 * watching, so the prompt itself must say how to deliver, require proof, and
 * end with a line the app can check.
 *
 * Lives in scripts/ (node: builtins only, plain JS) because three runtimes
 * need the same text: the app (src/lib/automation/delivery-contract.ts
 * re-exports it), the GitHub event bridge, which backfills it into
 * automations created outside the app's forms (for example by the chat agent
 * through the automation API), and the Docker image / desktop app, which ship
 * only scripts/.
 */

export const DELIVERY_CONTRACT_MARKER =
  "<!-- neodevex:delivery-contract v6 -->";

/** Matches the marker of any contract version, so older prompts upgrade. */
const ANY_CONTRACT_MARKER = /<!-- neodevex:delivery-contract v\d+ -->/;

/** Branch prefix the pull-requests view uses to attribute PRs to automations. */
export const AUTOMATION_BRANCH_PREFIX = "neodevex/";

/** Signature line for anything an automation posts on GitHub. */
export const AUTOMATION_SIGNATURE = "_Posted by a NeoDevEx automation._";

// v2: a v1 run asked to "push a fix to that pull request's branch" opened a
// second, stacked PR instead, because v1 always demanded a new branch. Devin
// pushed to the existing branch. Existing pull requests are now updated in place.
// v3: side by side with Devin on PR review and issue triage, our comments found
// the main bug but missed edge cases and knock-on effects, and one suggested a
// fix that contradicted the issue's own expected value. The run can execute code
// on its machine (Devin's sandbox could not), so v3 requires reproducing and
// verifying before writing, and reporting the real output.
// v4: Gemini 2.5 Flash skipped "reproduce first" when it was advice (A10 rerun:
// list files, view two files, post). The comment format now requires
// Reproduction and Verification sections with real command output, so a run
// cannot post a well-formed result without running anything.
// v5: a run with a revoked GITHUB_TOKEN gave up after the first 401 instead of
// using the machine's own login, and ran gh outside the cloned repository
// ("no git remotes found"). Both are now explicit first steps.
// v6: Layman-compressed (case-studies/tokens): same rules, commands, code,
// section names, signature and RESULT lines byte-for-byte, about 30% fewer
// tokens -- the contract rides in the first user message, which is resent on
// every model call of the run. Adds a Layman brief-narration rule.
export const DELIVERY_CONTRACT = `${DELIVERY_CONTRACT_MARKER}
## How to do this automation run well
Unattended run. Work like careful senior engineer; deliver; prove it.

### First, set up (do these before anything else)
1. Repo cloned for you ("Cloned Repositories" above)? \`cd\` into it; git and gh only see repo from inside.
2. Run \`gh api user --jq .login\`. On 401 or "Bad credentials": \`unset GITHUB_TOKEN\`, rerun (switches terminal to machine's own GitHub login). Still failing: stop, report FAILED with error.
3. Instructions mention triggering event but no "Event Payload" section above = Run now pressed: pick newest matching item (\`gh issue list\` / \`gh pr list\`), say which and why, continue.

### Get it right
- Read triggering issue, comment, PR or CI log in full, plus code it touches. Its stated expected behaviour (e.g. "expected 1200") defines correct; fix contradicting it = wrong.
- Reproduce before concluding: run failing input, test or one-line script (\`node -e\`, \`python -c\`); read real output. Run project tests after any change. Never claim pass you did not run.
- Look past first finding: follow value into callers; check edge cases (missing, empty, null, zero, boundaries like exactly 50.00, rounding, unexpected keys). PR: check CI (\`gh pr checks <number>\`), say if failures are from this change or pre-existing.
- Stay in scope: change only what task asks. Mention other problems; do not fix unasked.
- Narrate tersely between tool calls (Layman brief: fragments, no filler). Full detail only in delivered comment.

### Deliver it
- Run about existing PR (CI failed, comment): check out its head branch, commit fix there, push (\`gh pr checkout <number>\` then \`git push\`). No second PR. RESULT = URL of pushed commit or posted comment.
- Else new branch \`${AUTOMATION_BRANCH_PREFIX}<short-task-slug>\`, never default branch.
- Open PR: push branch, run \`gh pr create --fill --head <branch>\` (GITHUB_TOKEN set). No \`gh\`: REST \`POST https://api.github.com/repos/<owner>/<repo>/pulls\` with \`Authorization: Bearer $GITHUB_TOKEN\`. \`/pull/new/<branch>\` link is NOT a PR.
- Repo unreachable: run \`gh repo view <owner>/<repo>\`, report missing vs no access.
- Exactly one comment per issue or PR, via \`gh issue comment\` / \`gh pr comment\` or REST. Never \`--body "..."\` (shell eats backticks). Use quoted heredoc exactly (closing NEODEVEX_EOF at line start):
\`\`\`
gh pr comment <number> --body-file - <<'NEODEVEX_EOF'
<your markdown, backticks are safe here>
NEODEVEX_EOF
\`\`\`
- Comment or PR description: Markdown for reviewer who never saw run, sections in order, none left out:
  - \`### <one-line verdict>\` (review: approve or request changes; triage: type and priority P0-P3)
  - \`**Reproduction**\`: exact command + real output in code block. Cannot run here: say why.
  - \`**Findings**\`: numbered; each names file:line, what is wrong, evidence, knock-on effects on callers. List edge cases checked.
  - \`**Fix**\`: change made or recommended as code snippet, why it meets stated expected behaviour. Missing tests: list concrete cases.
  - \`**Verification**\`: command run after fix (or passing tests) + real output. PR: CI status, whether failures from this change.
  - Last line exactly: ${AUTOMATION_SIGNATURE}
  No other attribution (no "created by an AI agent"), no git trailers like \`Co-authored-by:\`.
- Before finishing, confirm result exists (e.g. \`gh pr view <url> --json url,state\`).
- End final message with exactly one line:
  \`RESULT: <url of the pull request, comment or commit you created>\`
  or if not delivered
  \`RESULT: FAILED <one-sentence reason>\`
- Never report unverified success. Auth still failing, repo missing, or task impossible without breaking a rule: stop, report FAILED with specific reason.`;

/**
 * The user's own instructions, without any contract version (for display and edit).
 *
 * @param {string} prompt
 * @returns {string}
 */
export function withoutDeliveryContract(prompt) {
  const at = prompt.search(ANY_CONTRACT_MARKER);
  return at === -1 ? prompt : prompt.slice(0, at).trimEnd();
}

/**
 * Append the current contract once. A prompt saved with any older contract
 * text -- even under the same marker -- gets the current one instead.
 *
 * @param {string} prompt
 * @returns {string}
 */
export function withDeliveryContract(prompt) {
  if (prompt.endsWith(DELIVERY_CONTRACT)) return prompt;
  return `${withoutDeliveryContract(prompt)}\n\n${DELIVERY_CONTRACT}`;
}

/**
 * True when the automation's prompt asks for a RESULT line.
 *
 * @param {string | null | undefined} prompt
 * @returns {boolean}
 */
export function hasDeliveryContract(prompt) {
  return !!prompt && ANY_CONTRACT_MARKER.test(prompt);
}

/**
 * The run's final report: the text of the newest agent message, read from
 * events sorted newest first. Returns null when an error ended the
 * conversation after that message, because the run did not finish after all.
 * A conversation resumed after a transient error that then finished counts:
 * its newest event is the closing message, not the old error.
 *
 * @param {{ kind?: string, source?: string, llm_message?: { content?: unknown } }[]} eventsNewestFirst
 * @returns {string | null}
 */
export function latestRunReport(eventsNewestFirst) {
  for (const event of eventsNewestFirst) {
    if (event.kind === "ConversationErrorEvent") return null;
    if (event.kind === "MessageEvent" && event.source === "agent") {
      const content = event.llm_message?.content;
      if (!Array.isArray(content)) return null;
      return content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String(part.text)
            : "",
        )
        .join("\n");
    }
  }
  return null;
}

const RESULT_LINE = /^\s*RESULT:\s*(.+?)\s*$/gim;
const URL_PATTERN = /https?:\/\/\S+/;
const NOT_A_PULL_REQUEST = /\/pull\/new\//;

/**
 * Read the outcome a run reported in its final agent message. A run that
 * "completed" but reported nothing, or reported a `/pull/new/` link, is not a
 * delivery -- the app shows it as unverified instead of as a success.
 *
 * @param {string | null | undefined} finalMessage
 * @returns {{ kind: "delivered", url: string } | { kind: "failed", reason: string } | { kind: "unreported" }}
 */
export function parseRunOutcome(finalMessage) {
  if (!finalMessage) return { kind: "unreported" };
  const lines = [...finalMessage.matchAll(RESULT_LINE)];
  const last = lines.at(-1)?.[1];
  if (!last) return { kind: "unreported" };
  if (/^FAILED\b/i.test(last)) {
    return {
      kind: "failed",
      reason: last.replace(/^FAILED\b[:\s-]*/i, "") || "No reason given",
    };
  }
  const url = last.match(URL_PATTERN)?.[0]?.replace(/[).,;`'"]+$/, "");
  if (!url || NOT_A_PULL_REQUEST.test(url)) return { kind: "unreported" };
  return { kind: "delivered", url };
}

const ERROR_KINDS = [
  [
    "llm_auth",
    /AuthenticationError|invalid_api_key|Incorrect API key|API key not valid|PERMISSION_DENIED|\b401\b/i,
  ],
  [
    "llm_quota",
    /RateLimitError|RESOURCE_EXHAUSTED|\b429\b|quota|rate[ _-]?limit/i,
  ],
  [
    "context_window",
    /ContextWindowExceeded|context length|maximum context|too many tokens/i,
  ],
  ["budget", /budget|max_budget_per_task|ExceededBudget/i],
];

/**
 * Why a run's conversation ended in error, in one readable line, plus a
 * coarse kind the app turns into a fix hint. The automation service only
 * records "Remote conversation ended with error"; the cause (for example a
 * missing model API key) is in the conversation's ConversationErrorEvent.
 *
 * @param {{ kind?: string, source?: unknown, detail?: unknown, code?: unknown }[]} eventsNewestFirst
 * @returns {{ summary: string, kind: "llm_auth" | "llm_quota" | "context_window" | "budget" | "other" } | null}
 */
export function latestRunError(eventsNewestFirst) {
  for (const event of eventsNewestFirst) {
    if (event.kind === "MessageEvent") return null;
    if (event.kind !== "ConversationErrorEvent") continue;
    const detail = String(event.detail ?? event.code ?? "");
    const message =
      /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(detail)?.[1] ??
      detail.split("\n").find((line) => line.trim()) ??
      "";
    const errorClass = /\b([A-Z]\w*(?:Error|Exception|Exceeded))\b/.exec(
      detail,
    )?.[1];
    const summary = [
      errorClass && !message.includes(errorClass) ? `${errorClass}:` : "",
      message.trim(),
    ]
      .join(" ")
      .trim()
      .slice(0, 300);
    const kind =
      ERROR_KINDS.find(([, pattern]) => pattern.test(detail))?.[0] ?? "other";
    return summary
      ? {
          summary,
          kind: /** @type {"llm_auth" | "llm_quota" | "context_window" | "budget" | "other"} */ (
            kind
          ),
        }
      : null;
  }
  return null;
}
