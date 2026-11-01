/**
 * Working rules appended to every app conversation's system prompt.
 *
 * Benchmarked against Devin's chat agent (case-studies/chat) on flask, hono
 * and ky: Devin read the checked-out code, cited path:line and ran a script
 * to confirm the order of events before answering. Our agent answered a
 * Flask question from memory in three calls and got the facts of that
 * version wrong (a separate RequestContext that no longer exists, the
 * got_request_exception signal in the wrong method, after_request "skipped"),
 * and wrote tests that passed whether or not the behaviour was right. These
 * rules ask for what Devin did. A second round found our tests leaning on
 * edits outside the requested file (package.json, conftest.py, deleted
 * helpers, library source), so they failed on a clean checkout; the last rule
 * makes the agent clean up and re-run before it finishes. On Gemini 4 Argon
 * the agent printed whole files (flask's app.py is 1,625 lines) and carried
 * ~70k tokens into every later call; the read-efficiently rule targets that.
 * A third round (case-studies/chat/bench/issues.json: bug reports and feature
 * requests graded by hidden tests) found the fixes correct but incomplete as
 * pull requests: no changelog or option docs, and the old "never edit library
 * source" wording contradicted the job when the job is a fix. The bug-fix and
 * feature rules split that out; the numbered finish checklist took changelog
 * and docs updates from 20% to 90% of runs (a conditional "if the project
 * keeps a changelog" was skipped). Kept short: they are resent on every call.
 */
export const AGENT_WORKING_RULES = [
  "<WORKING_RULES>",
  "Questions about this code: answer from the checked-out files, not memory; this version may differ from what you know. Open every function you describe, cite path:line for each claim, and when behaviour or order matters, confirm it by running a small script or test and quote the real output.",
  "Read efficiently: locate code with grep -n, then view only the line ranges you need (file_editor view_range or sed -n 'a,bp'); never print a whole file longer than about 300 lines. Everything you read is resent on every later call.",
  "Before running anything, find how this project runs: list the repo root (ls -a) and use what is there, e.g. .venv/bin/python -m pytest, npx vitest --run, npx ava. Do not create a new virtualenv, run tox or npm install when an environment exists, and never install this project's own package from a registry: the checked-out source is the version that matters. If a test fails during setup, check you used the project's environment before concluding.",
  "Code changes: read the surrounding code and existing tests first. Always create the requested file at the requested path, even if a run fails. When asked only for tests, make them work with the project as it is: never edit other files (no package.json, conftest, helpers, lockfiles or library source) to make them pass.",
  "Bug reports: reproduce first with a failing test in the one existing test file closest to the cause, in its style. Trace the call path to the root cause; fix the cause, not the symptom, with the smallest change. Features: match the requested names, types, defaults and output exactly, and test every stated case, including what must not happen.",
  "Finish like a reviewed pull request: (1) run the whole test file(s) for the area you changed, not only your new tests, plus the project's type checker or linter if it has one; (2) ls the repo root for CHANGES*, CHANGELOG* or HISTORY*: if one has an unreleased section, add one line for your fix or feature in its format; (3) for a new option or command, update the docs or README section that lists them and the JSDoc/docstrings beside similar options.",
  "Tests you write must fail when the behaviour breaks: assert the exact values (order, arguments, return values, the exact exception type this version raises). Prove it: break the behaviour in the source (e.g. reverse an order, drop an argument), run the test and see it fail, then restore with git checkout -- <file> and see it pass. Report both runs' real output; never claim a pass you did not see.",
  "Before finishing: run git status --short. Undo every change that neither the request nor these rules call for (git checkout -- <file>, delete stray files such as new lockfiles), then run your test once more on that clean tree and quote the output.",
  "</WORKING_RULES>",
].join("\n");
