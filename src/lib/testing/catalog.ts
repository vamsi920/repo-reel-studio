/**
 * Tool catalog: what an autonomous tester can run per test kind and
 * language, MIT-first so enterprises can use it without licence review,
 * with the exact invocation that writes a machine-readable result the
 * studio parses. Non-MIT entries are kept only where no MIT tool exists and
 * are flagged. Licences verified against the upstream repositories on
 * 2026-11-01.
 *
 * `describe` hands the relevant slice to the agent; `stack.ts` builds
 * suggestions from it; the coverage matrix shows which tool covered what.
 *
 * @spec NT-002 — Test kinds
 */
import type { ArtifactFormat, TestKind } from "./model";

export type Language = "javascript" | "python" | "go" | "java" | "rust" | "any";

export interface CatalogTool {
  id: string;
  name: string;
  kinds: TestKind[];
  languages: Language[];
  /** SPDX identifier. */
  license: string;
  /** False for Apache/MPL/LGPL/BSD entries kept for lack of an MIT option. */
  mit: boolean;
  /** Install-free invocation template; `<url>` / `<spec>` are placeholders. */
  command: string;
  /** Result file the command writes (workspace-relative) and its format. */
  result?: { path: string; format: ArtifactFormat };
  /** Can produce tests from code / a spec, not only run them. */
  generates?: boolean;
  /** Needs a browser, Docker, or a running app. */
  needs?: ("browser" | "docker" | "running_app" | "openapi")[];
  notes?: string;
}

const R = ".neotest/results";

export const TOOL_CATALOG: readonly CatalogTool[] = Object.freeze([
  // ── unit / integration runners ───────────────────────────────────────
  {
    id: "vitest",
    name: "Vitest",
    kinds: ["unit", "integration"],
    languages: ["javascript"],
    license: "MIT",
    mit: true,
    command: `npx -y vitest run --reporter=junit --outputFile=${R}/vitest-junit.xml --coverage --coverage.reporter=lcov --coverage.reportsDirectory=${R}/coverage`,
    result: { path: `${R}/vitest-junit.xml`, format: "junit" },
    notes:
      "Also declare .neotest/results/coverage/lcov.info as an lcov result.",
  },
  {
    id: "jest",
    name: "Jest",
    kinds: ["unit", "integration"],
    languages: ["javascript"],
    license: "MIT",
    mit: true,
    command: `npx -y jest --ci --json --outputFile=${R}/jest.json --coverage --coverageReporters=lcov --coverageDirectory=${R}/coverage`,
    result: { path: `${R}/jest.json`, format: "jest" },
  },
  {
    id: "node-test",
    name: "node:test",
    kinds: ["unit", "integration", "api", "e2e", "contract"],
    languages: ["javascript"],
    license: "MIT",
    mit: true,
    command: `node --test --experimental-test-coverage --test-reporter=junit --test-reporter-destination=${R}/unit-junit.xml --test-reporter=lcov --test-reporter-destination=${R}/lcov.info test/*.test.js`,
    result: { path: `${R}/unit-junit.xml`, format: "junit" },
    notes:
      "No install. Use fetch against an app started in the suite's setup for API/e2e flows.",
  },
  {
    id: "pytest",
    name: "pytest + pytest-cov",
    kinds: ["unit", "integration", "api", "e2e", "contract"],
    languages: ["python"],
    license: "MIT (coverage.py Apache-2.0)",
    mit: true,
    command: `uvx --with pytest-cov pytest -q --junitxml=${R}/pytest-junit.xml --cov=. --cov-report=xml:${R}/coverage.xml`,
    result: { path: `${R}/pytest-junit.xml`, format: "junit" },
    notes: "Declare .neotest/results/coverage.xml as cobertura.",
  },
  {
    id: "go-test",
    name: "go test + go-junit-report",
    kinds: ["unit", "integration", "api"],
    languages: ["go"],
    license: "BSD-3 (go) / MIT (go-junit-report)",
    mit: true,
    command: `go test ./... -json -coverprofile=${R}/cover.out > ${R}/gotest.json`,
    result: { path: `${R}/gotest.json`, format: "gotest" },
  },
  {
    id: "maven-surefire",
    name: "Maven Surefire / Gradle",
    kinds: ["unit", "integration"],
    languages: ["java"],
    license: "Apache-2.0 / EPL-2.0",
    mit: false,
    command: "mvn -B -q test",
    result: { path: "target/surefire-reports/TEST-*.xml", format: "junit" },
    notes: "No MIT JVM runner exists; JUnit XML is written by default.",
  },
  {
    id: "cargo-nextest",
    name: "cargo-nextest + cargo-llvm-cov",
    kinds: ["unit", "integration"],
    languages: ["rust"],
    license: "MIT OR Apache-2.0",
    mit: true,
    command: `cargo nextest run --profile ci`,
    result: { path: "target/nextest/ci/junit.xml", format: "junit" },
    notes:
      'Needs [profile.ci.junit] path = "junit.xml" in .config/nextest.toml; coverage via cargo llvm-cov --lcov --output-path .neotest/results/lcov.info.',
  },
  {
    id: "testcontainers",
    name: "Testcontainers",
    kinds: ["integration"],
    languages: ["javascript", "python", "go", "java", "rust"],
    license: "MIT",
    mit: true,
    command:
      "(library) real database/queue per test, reported by the unit runner",
    needs: ["docker"],
  },
  // ── API / contract ───────────────────────────────────────────────────
  {
    id: "schemathesis",
    name: "Schemathesis",
    kinds: ["api", "contract"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `uvx schemathesis run <spec> --url <url> --report junit --report-junit-path ${R}/schemathesis-junit.xml`,
    result: { path: `${R}/schemathesis-junit.xml`, format: "junit" },
    generates: true,
    needs: ["openapi", "running_app"],
    notes:
      "Property-based tests generated from OpenAPI/GraphQL; the best MIT API generator.",
  },
  {
    id: "specmatic",
    name: "Specmatic",
    kinds: ["contract"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command:
      "docker run --network host specmatic/specmatic test --testBaseURL=<url>",
    result: {
      path: "build/reports/specmatic/junit/TEST-*.xml",
      format: "junit",
    },
    generates: true,
    needs: ["docker", "openapi", "running_app"],
  },
  {
    id: "bruno",
    name: "Bruno CLI",
    kinds: ["api"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `npx -y @usebruno/cli run collection --reporter-junit ${R}/bruno-junit.xml`,
    result: { path: `${R}/bruno-junit.xml`, format: "junit" },
    needs: ["running_app"],
  },
  {
    id: "tavern",
    name: "Tavern",
    kinds: ["api", "integration"],
    languages: ["python"],
    license: "MIT",
    mit: true,
    command: `uvx tavern-ci test_*.tavern.yaml --junit-xml=${R}/tavern-junit.xml`,
    result: { path: `${R}/tavern-junit.xml`, format: "junit" },
    needs: ["running_app"],
  },
  {
    id: "pact",
    name: "Pact",
    kinds: ["contract"],
    languages: ["javascript", "python", "go", "java", "rust"],
    license: "MIT",
    mit: true,
    command:
      "npx -y @pact-foundation/pact-cli verify --provider-base-url <url> --pact-urls pacts/*.json",
    needs: ["running_app"],
    notes: "Consumer-driven; results are console unless a broker is used.",
  },
  {
    id: "hurl",
    name: "Hurl",
    kinds: ["api"],
    languages: ["any"],
    license: "Apache-2.0",
    mit: false,
    command: `hurl --test --report-junit ${R}/hurl-junit.xml tests/*.hurl`,
    result: { path: `${R}/hurl-junit.xml`, format: "junit" },
    needs: ["running_app"],
  },
  // ── e2e / visual ─────────────────────────────────────────────────────
  {
    id: "cypress",
    name: "Cypress",
    kinds: ["e2e"],
    languages: ["javascript"],
    license: "MIT",
    mit: true,
    command: `npx -y cypress run --reporter junit --reporter-options mochaFile=${R}/cypress-[hash].xml`,
    result: { path: `${R}/cypress-*.xml`, format: "junit" },
    needs: ["browser", "running_app"],
  },
  {
    id: "testcafe",
    name: "TestCafe",
    kinds: ["e2e"],
    languages: ["javascript"],
    license: "MIT",
    mit: true,
    command: `npx -y testcafe chrome:headless tests/e2e -r xunit:${R}/testcafe-junit.xml`,
    result: { path: `${R}/testcafe-junit.xml`, format: "junit" },
    needs: ["browser", "running_app"],
    notes: "No driver install.",
  },
  {
    id: "playwright",
    name: "Playwright",
    kinds: ["e2e"],
    languages: ["javascript", "python"],
    license: "Apache-2.0",
    mit: false,
    command: `PLAYWRIGHT_JUNIT_OUTPUT_NAME=${R}/playwright-junit.xml npx -y playwright test --reporter=junit --retries=1 --trace=on-first-retry`,
    result: { path: `${R}/playwright-junit.xml`, format: "junit" },
    needs: ["browser", "running_app"],
    notes: "Most reliable browser runner; Apache-2.0.",
  },
  {
    id: "backstopjs",
    name: "BackstopJS",
    kinds: ["e2e"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: "npx -y backstop test --config=backstop.json",
    result: {
      path: "backstop_data/json_report/jsonReport.json",
      format: "backstop",
    },
    needs: ["browser", "running_app"],
    notes: "Visual regression; `backstop reference` seeds the baselines first.",
  },
  {
    id: "midscene",
    name: "Midscene.js",
    kinds: ["e2e"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `npx -y @midscene/cli ./e2e/*.yaml`,
    needs: ["browser", "running_app"],
    generates: true,
    notes:
      "Natural-language E2E: YAML cases with ai/aiAssert/aiQuery steps over Playwright. Needs a model (MIDSCENE_MODEL_NAME + OPENAI_API_KEY-compatible env); writes midscene_run/report/. Wrap the run in a node:test case that asserts the exit code and declare its JUnit.",
  },
  {
    id: "stagehand",
    name: "Stagehand",
    kinds: ["e2e"],
    languages: ["javascript"],
    license: "MIT",
    mit: true,
    command:
      "(library) page.act / page.observe / page.extract inside Playwright specs",
    needs: ["browser", "running_app"],
    notes:
      "Self-healing steps for brittle selectors; local browser mode needs a model key.",
  },
  {
    id: "alumnium",
    name: "Alumnium (MCP)",
    kinds: ["e2e"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command:
      "uvx alumnium mcp  (register as an MCP server; do/check/get over Playwright)",
    needs: ["browser", "running_app"],
    notes:
      "Lets the agent drive a browser in-conversation with natural language.",
  },
  // ── performance ──────────────────────────────────────────────────────
  {
    id: "autocannon",
    name: "autocannon",
    kinds: ["performance"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `npx -y autocannon -c 10 -d 10 -j <url> > ${R}/autocannon.json`,
    result: { path: `${R}/autocannon.json`, format: "autocannon" },
    needs: ["running_app"],
  },
  {
    id: "oha",
    name: "oha",
    kinds: ["performance"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `oha -z 10s -c 10 -j <url> > ${R}/oha.json`,
    result: { path: `${R}/oha.json`, format: "oha" },
    needs: ["running_app"],
    notes: "Single Rust binary (cargo install oha / brew install oha).",
  },
  {
    id: "vegeta",
    name: "vegeta",
    kinds: ["performance"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `echo "GET <url>" | vegeta attack -rate=50 -duration=10s | vegeta report -type=json > ${R}/vegeta.json`,
    result: { path: `${R}/vegeta.json`, format: "vegeta" },
    needs: ["running_app"],
  },
  {
    id: "bombardier",
    name: "bombardier",
    kinds: ["performance"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `go run github.com/codesenberg/bombardier@latest -c 25 -d 10s -o json -p r <url> > ${R}/bombardier.json`,
    result: { path: `${R}/bombardier.json`, format: "bombardier" },
    needs: ["running_app"],
  },
  {
    id: "locust",
    name: "Locust",
    kinds: ["performance"],
    languages: ["python"],
    license: "MIT",
    mit: true,
    command: `uvx locust -f locustfile.py --headless -u 20 -r 5 -t 30s --csv=${R}/locust`,
    needs: ["running_app"],
    notes:
      "Writes locust_stats.csv; summarise into a checks.json or k6-shaped JSON for the studio.",
  },
  {
    id: "k6",
    name: "k6",
    kinds: ["performance"],
    languages: ["any"],
    license: "AGPL-3.0",
    mit: false,
    command: `k6 run --summary-export=${R}/k6-summary.json script.js`,
    result: { path: `${R}/k6-summary.json`, format: "k6" },
    needs: ["running_app"],
    notes: "AGPL: run it only where that licence is acceptable.",
  },
  // ── accessibility ────────────────────────────────────────────────────
  {
    id: "axe-playwright",
    name: "axe-playwright",
    kinds: ["accessibility"],
    languages: ["javascript"],
    license: "MIT (axe-core engine MPL-2.0)",
    mit: true,
    command: `(library) injectAxe + checkA11y(page, null, {}, false, "junit", { outputDir: "${R}", reportFileName: "a11y-junit.xml" }) inside a Playwright spec`,
    result: { path: `${R}/a11y-junit.xml`, format: "junit" },
    needs: ["browser", "running_app"],
    notes: "MIT glue around axe-core; JUnit output, one case per rule.",
  },
  {
    id: "neotest-a11y-static",
    name: "Static HTML scan (axe-shaped)",
    kinds: ["accessibility"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `node scripts/a11y-static.mjs <url> > ${R}/axe.json`,
    result: { path: `${R}/axe.json`, format: "axe" },
    notes:
      "When no browser is available: fetch the page, check images without alt, inputs without labels, missing lang, headings order and stylesheet contrast, and write axe-shaped JSON (violations[] with impact). Say in the suite rationale that it is static.",
  },
  {
    id: "axe-cli",
    name: "@axe-core/cli",
    kinds: ["accessibility"],
    languages: ["any"],
    license: "MPL-2.0",
    mit: false,
    command: `npx -y @axe-core/cli <url> --save ${R}/axe.json --tags wcag2a,wcag2aa`,
    result: { path: `${R}/axe.json`, format: "axe" },
    needs: ["browser", "running_app"],
    notes:
      "axe-core is MPL-2.0 (file-level copyleft, fine to run). axe-playwright is the MIT glue.",
  },
  {
    id: "lighthouse",
    name: "Lighthouse",
    kinds: ["accessibility", "performance"],
    languages: ["any"],
    license: "Apache-2.0",
    mit: false,
    command: `npx -y lighthouse <url> --only-categories=accessibility,performance --output=json --output-path=${R}/lighthouse.json --chrome-flags=--headless`,
    result: { path: `${R}/lighthouse.json`, format: "lighthouse" },
    needs: ["browser", "running_app"],
  },
  {
    id: "pa11y",
    name: "pa11y",
    kinds: ["accessibility"],
    languages: ["any"],
    license: "LGPL-3.0",
    mit: false,
    command: `npx -y pa11y <url> --reporter json > ${R}/pa11y.json`,
    result: { path: `${R}/pa11y.json`, format: "pa11y" },
    needs: ["browser", "running_app"],
  },
  // ── security ─────────────────────────────────────────────────────────
  {
    id: "npm-audit",
    name: "npm audit",
    kinds: ["security"],
    languages: ["javascript"],
    license: "Artistic-2.0 (bundled with npm)",
    mit: true,
    command: `npm audit --json > ${R}/npm-audit.json || true`,
    result: { path: `${R}/npm-audit.json`, format: "npm_audit" },
  },
  {
    id: "gitleaks",
    name: "gitleaks",
    kinds: ["security"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `gitleaks dir . -f json -r ${R}/gitleaks.json --redact || true`,
    result: { path: `${R}/gitleaks.json`, format: "gitleaks" },
    notes:
      "Secrets in the tree; brew install gitleaks or the ghcr.io/gitleaks/gitleaks image.",
  },
  {
    id: "nuclei",
    name: "nuclei",
    kinds: ["security"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `nuclei -u <url> -jsonl -o ${R}/nuclei.jsonl`,
    result: { path: `${R}/nuclei.jsonl`, format: "nuclei" },
    needs: ["running_app"],
    notes:
      "DAST against the running app (go run github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest).",
  },
  {
    id: "cargo-audit",
    name: "cargo-audit",
    kinds: ["security"],
    languages: ["rust"],
    license: "MIT OR Apache-2.0",
    mit: true,
    command: `cargo audit --json > ${R}/cargo-audit.json || true`,
    result: { path: `${R}/cargo-audit.json`, format: "cargo_audit" },
  },
  {
    id: "govulncheck",
    name: "govulncheck",
    kinds: ["security"],
    languages: ["go"],
    license: "BSD-3-Clause",
    mit: true,
    command: `go run golang.org/x/vuln/cmd/govulncheck@latest -json ./... > ${R}/govulncheck.json || true`,
    result: { path: `${R}/govulncheck.json`, format: "govulncheck" },
  },
  {
    id: "pip-audit",
    name: "pip-audit",
    kinds: ["security"],
    languages: ["python"],
    license: "Apache-2.0",
    mit: false,
    command: `uvx pip-audit -f json -o ${R}/pip-audit.json || true`,
    result: { path: `${R}/pip-audit.json`, format: "pip_audit" },
  },
  {
    id: "osv-scanner",
    name: "osv-scanner",
    kinds: ["security"],
    languages: ["any"],
    license: "Apache-2.0",
    mit: false,
    command: `go run github.com/google/osv-scanner/v2/cmd/osv-scanner@latest scan source -r . --format json --output ${R}/osv.json || true`,
    result: { path: `${R}/osv.json`, format: "osv_scanner" },
    notes: "No MIT multi-ecosystem dependency scanner exists.",
  },
  {
    id: "semgrep",
    name: "semgrep",
    kinds: ["security"],
    languages: ["any"],
    license: "LGPL-2.1 (engine)",
    mit: false,
    command: `uvx semgrep scan --config p/default --json -o ${R}/semgrep.json || true`,
    result: { path: `${R}/semgrep.json`, format: "semgrep" },
  },
  // ── data quality ─────────────────────────────────────────────────────
  {
    id: "neotest-checks",
    name: "Neo Test checks.json",
    kinds: ["data"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `node scripts/data-checks.mjs > ${R}/checks.json`,
    result: { path: `${R}/checks.json`, format: "neotest_checks" },
    notes:
      "A script that opens the real store (or Neo Synth rows) and writes {checks:[{name,dataset,column,status,severity,...}]}.",
  },
  {
    id: "pandera",
    name: "pandera",
    kinds: ["data"],
    languages: ["python"],
    license: "MIT",
    mit: true,
    command:
      "uvx --with pandera python checks.py  (schema.validate(df, lazy=True); write failure_cases to checks.json)",
    result: { path: `${R}/checks.json`, format: "neotest_checks" },
    generates: true,
    notes: "pandera.infer_schema(df) drafts a schema from data.",
  },
  {
    id: "sqlfluff",
    name: "sqlfluff",
    kinds: ["data"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `uvx sqlfluff lint sql/ --dialect postgres -f junit > ${R}/sqlfluff-junit.xml || true`,
    result: { path: `${R}/sqlfluff-junit.xml`, format: "junit" },
  },
  {
    id: "great-expectations",
    name: "Great Expectations",
    kinds: ["data"],
    languages: ["python"],
    license: "Apache-2.0",
    mit: false,
    command: "uvx great_expectations ... (checkpoint JSON result)",
    result: { path: `${R}/ge-validation.json`, format: "great_expectations" },
  },
  // ── mutation ─────────────────────────────────────────────────────────
  {
    id: "neotest-prove",
    name: "Neo Test prove",
    kinds: ["mutation"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: "test_control prove {file, suite_id}",
    notes:
      "Operator mutants applied one at a time by the studio's harness; no install.",
  },
  {
    id: "stryker",
    name: "StrykerJS",
    kinds: ["mutation"],
    languages: ["javascript"],
    license: "Apache-2.0",
    mit: false,
    command: "npx -y stryker run --reporters json",
    result: { path: "reports/mutation/mutation.json", format: "stryker" },
  },
  {
    id: "cargo-mutants",
    name: "cargo-mutants",
    kinds: ["mutation"],
    languages: ["rust"],
    license: "MIT",
    mit: true,
    command: "cargo mutants --json -o mutants.out",
    result: { path: "mutants.out/outcomes.json", format: "cargo_mutants" },
  },
  {
    id: "cosmic-ray",
    name: "cosmic-ray",
    kinds: ["mutation"],
    languages: ["python"],
    license: "MIT",
    mit: true,
    command:
      "uvx cosmic-ray init cr.toml s.sqlite && uvx cosmic-ray exec cr.toml s.sqlite && uvx --from cosmic-ray cr-report s.sqlite",
    notes: "Summarise the report into checks.json or rely on prove.",
  },
  {
    id: "go-mutesting",
    name: "go-mutesting",
    kinds: ["mutation"],
    languages: ["go"],
    license: "MIT",
    mit: true,
    command:
      "go run github.com/zimmski/go-mutesting/cmd/go-mutesting@latest ./...",
  },
  // ── generation helpers ───────────────────────────────────────────────
  {
    id: "fast-check",
    name: "fast-check",
    kinds: ["unit"],
    languages: ["javascript"],
    license: "MIT",
    mit: true,
    command: "(library) property-based tests inside Vitest/Jest/node:test",
    generates: true,
  },
  {
    id: "pynguin",
    name: "Pynguin",
    kinds: ["unit"],
    languages: ["python"],
    license: "MIT",
    mit: true,
    command:
      "PYNGUIN_DANGER_AWARE=1 uvx pynguin --project-path . --module-name <module> --output-path tests/generated",
    generates: true,
    notes:
      "Search-based unit test generation; review generated tests before keeping them.",
  },
  {
    id: "randoop",
    name: "Randoop",
    kinds: ["unit"],
    languages: ["java"],
    license: "MIT",
    mit: true,
    command:
      "java -cp randoop.jar randoop.main.Main gentests --testclass=<Class> --output-limit=200",
    generates: true,
  },
  {
    id: "hypothesis-write",
    name: "hypothesis write",
    kinds: ["unit"],
    languages: ["python"],
    license: "MPL-2.0",
    mit: false,
    command:
      "uvx --from hypothesis hypothesis write <module.function> > tests/test_<name>_props.py",
    generates: true,
    notes:
      "Ghost-writes property-based skeletons; MPL is file-level copyleft, fine to run.",
  },
  {
    id: "ctrf",
    name: "CTRF (junit-to-ctrf)",
    kinds: ["unit", "integration", "api", "e2e", "contract"],
    languages: ["any"],
    license: "MIT",
    mit: true,
    command: `npx -y junit-to-ctrf ${R}/<junit>.xml -o ${R}/ctrf.json`,
    result: { path: `${R}/ctrf.json`, format: "ctrf" },
    notes:
      "One JSON schema across every runner; the studio parses it natively.",
  },
]);

/** Catalog entries that apply to the languages the stack recorded. */
export function catalogFor(
  languages: readonly string[],
  options: { mitOnly?: boolean } = {},
): CatalogTool[] {
  const langs = new Set(languages.map(normalizeLanguage));
  return TOOL_CATALOG.filter(
    (tool) =>
      (!options.mitOnly || tool.mit) &&
      (tool.languages.includes("any") ||
        tool.languages.some((l) => langs.has(l))),
  );
}

/** Groups applicable tools by kind, MIT entries first. */
export function catalogByKind(
  languages: readonly string[],
): Record<TestKind, CatalogTool[]> {
  const tools = catalogFor(languages);
  const out = {} as Record<TestKind, CatalogTool[]>;
  for (const tool of tools) {
    for (const kind of tool.kinds) {
      (out[kind] ??= []).push(tool);
    }
  }
  for (const kind of Object.keys(out) as TestKind[]) {
    out[kind].sort((a, b) => Number(b.mit) - Number(a.mit));
  }
  return out;
}

export function normalizeLanguage(value: string): Language {
  const v = value.toLowerCase();
  if (/typescript|javascript|node|js|ts/.test(v)) return "javascript";
  if (/python|py/.test(v)) return "python";
  if (/\bgo\b|golang/.test(v)) return "go";
  if (/java|kotlin|jvm/.test(v)) return "java";
  if (/rust/.test(v)) return "rust";
  return "any";
}
