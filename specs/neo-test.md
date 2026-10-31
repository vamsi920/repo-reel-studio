# Neo Test — the testing agent studio

Route `/testing` (projects) and `/testing/:projectId` (studio). Sidebar entry
"Test". Same shape as Neo Synth and Neo ME: chat on the left, a workbench on
the right, one client tool (`test_control`), receipts hidden from the
transcript. Spec IDs are stable; never renumber.

## Why it is built this way

Products that do this well (Qodo Cover, Diffblue, Meticulous, k6, Soda,
Devin) share one trait: **the agent proposes, the tooling decides.** A test
only counts when the runner saw it pass; coverage only counts when a coverage
file says so; a performance budget is declared before the run; a failing data
check is never "explained away". Neo Test keeps that split: the agent reads
the code and KT docs, writes tests and a plan; the studio runs the plan with
its own harness, parses the artifacts, evaluates the quality gates, writes the
report and refuses `complete` until the evidence exists.

## NT-001 Project and source

A project points at a repository (`owner/name@branch`) or a local folder. One
conversation per project carries `NEOTEST_SYSTEM_BRIEF` as
`extraSystemSuffix`. Projects live in the zustand store
`openhands-test-studio` (plan, gates, runs, findings, log, report). Nothing
in the store is real data from the project beyond paths, names and numbers.

## NT-002 Test kinds

`unit`, `integration`, `api`, `e2e`, `performance`, `data`, `security`,
`accessibility`, `contract`, `mutation`. Every suite in the plan has exactly
one kind; the report groups by kind. A kind the stack cannot support is
recorded as `not_applicable` with a reason, never silently omitted.

## NT-003 Harness

`src/lib/testing/neotest-runner.mjs` is a dependency-free Node script the
studio installs at `.neotest/run.mjs` (base64 writes through the runtime,
never raw content in a shell command). It reads `.neotest/plan.json`, runs
each suite's command in its own process group with a timeout, copies the
declared result files into `.neotest/runs/<run id>/artifacts/<suite>/`, keeps
a stdout/stderr tail, and writes `.neotest/runs/<run id>/status.json`
**progressively** (suite by suite) so the studio can show progress and a
reload loses nothing. `--mutate <file> --suite <id>` applies small operator
mutants to one file (one at a time, always restored) and records which the
suite killed: a cheap, dependency-free proof that the tests detect bugs.
`.neotest/` is added to `.git/info/exclude`.

## NT-004 Parsing is the studio's job

`src/lib/testing/parsers/` turns artifacts into one shape: JUnit XML (any
runner), Jest/Vitest JSON, pytest-json-report, `go test -json`, coverage
(lcov, Cobertura, Istanbul `coverage-summary.json`, coverage.py JSON),
performance (k6 summary JSON, autocannon JSON), accessibility (axe-core
JSON), security (npm audit, pip-audit, semgrep, trivy JSON), data checks
(Neo Test's own `checks.json` and Great Expectations validation results),
mutation (Stryker JSON and the harness's own `mutation.json`). A suite with
no parseable artifact falls back to its exit code and is labelled
`exit_code_only`; its tests are not counted.

## NT-005 Quality gates

Declared in the plan before the run (the agent may propose, the user edits,
nothing changes them after a run starts). Defaults: zero failed tests;
line coverage ≥ 70% and not down more than 1 point vs the previous run; p95
latency ≤ 500 ms and error rate ≤ 1% per performance scenario; zero failed
critical data checks; zero critical/high security findings; zero
critical/serious accessibility violations; mutation score ≥ 60% when
measured. Verdict: any blocking rule failed → `failed`; only warnings →
`warned`; else `passed`. A gate whose metric was not measured is `not_measured`,
never passed.

## NT-006 Report, always present

Every run writes `.neotest/runs/<id>/report.json`, and the studio rewrites
`.neotest/REPORT.md` + `.neotest/latest.json` after each run, so the project
always has a current test report on disk. The workbench shows the latest run,
the gate verdict, per-kind results, failures with evidence, coverage, latency
percentiles, data checks, findings and the trend across runs. Flaky tests
(failed then passed on retry, or alternating on the same commit) are listed
separately and never count as passes.

## NT-007 Enforcement

- `set_plan` is refused until `record_stack` recorded the stack.
- `run` is executed by the studio; the agent only names suites. The receipt
  carries the parsed numbers, never the agent's.
- `complete` is refused until every planned suite ran at least once, the
  latest run's gates were evaluated, the report was written, and no card is
  open. Blockers are listed in `describe` as `completion_blockers`.
- `record_finding` and `record_stack` run `scanForSecrets`.
- Receipts and commands are replayed from history when the tab was away
  (`handledActionIds`), except `run`, which is answered with
  `studio_was_away`.

## NT-008 KT and Synth power-ups

`describe` reports whether `.neodevex/kt/INDEX.md` exists (and the page list
from the knowledge store) so the agent plans from the architecture map, and
lists Neo Synth datasets generated for the same source (workspace dirs,
verified flag) so data and load tests run on realistic rows. The brief tells
the agent to send the user to Synth (a choice card) when a data suite needs
data and none exists.

## NT-009 Keep it running

The Schedule card creates a NeoDevEx automation (nightly cron, or on push for
GitHub sources) whose prompt runs the harness and reports from
`status.json`; the automation id is kept on the project. Deleting the project
leaves the automation (it is the user's) and says so.
