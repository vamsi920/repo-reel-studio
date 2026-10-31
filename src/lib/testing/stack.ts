/**
 * Stack hints from a file listing: which runners the project already uses
 * and the suite the studio would suggest for each kind. The agent confirms
 * or corrects them with `record_stack`; nothing here is authoritative.
 */
import type { ArtifactFormat, TestKind } from "./model";

export interface StackHint {
  languages: string[];
  frameworks: string[];
  runners: string[];
  /** Config files that triggered a hint. */
  evidence: string[];
  /** Suggested suites the agent can start from. */
  suggestions: {
    kind: TestKind;
    name: string;
    command: string;
    results: { path: string; format: ArtifactFormat }[];
    why: string;
  }[];
  ci: string[];
}

/** Shell listing the studio runs to feed `detectStack`. */
export const STACK_FIND_COMMAND =
  "find . -maxdepth 3 -type f \\( -name 'package.json' -o -name 'pyproject.toml' -o -name 'setup.py' -o -name 'requirements*.txt' -o -name 'pytest.ini' -o -name 'tox.ini' -o -name 'go.mod' -o -name 'Cargo.toml' -o -name 'pom.xml' -o -name 'build.gradle*' -o -name '*.csproj' -o -name 'Gemfile' -o -name 'composer.json' -o -name 'vitest.config.*' -o -name 'jest.config.*' -o -name 'playwright.config.*' -o -name 'cypress.config.*' -o -name 'k6*.js' -o -name 'locustfile.py' -o -name 'schema.prisma' -o -name 'openapi.*' -o -name 'swagger.*' -o -name 'great_expectations.yml' -o -name 'soda*.yml' -o -name 'stryker.config.*' -o -name 'stryker.conf.*' -o -name '.eslintrc*' -o -name 'docker-compose*.yml' -o -name 'Dockerfile' \\) -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.venv/*' -not -path '*/venv/*' 2>/dev/null | head -80; ls .github/workflows 2>/dev/null | head -20 | sed 's#^#.github/workflows/#'; ls .gitlab-ci.yml Jenkinsfile .circleci/config.yml 2>/dev/null";

export function detectStack(files: string[], packageJson?: unknown): StackHint {
  const hint: StackHint = {
    languages: [],
    frameworks: [],
    runners: [],
    evidence: [],
    suggestions: [],
    ci: [],
  };
  const has = (re: RegExp) => files.some((f) => re.test(f));
  const add = (list: string[], v: string) => {
    if (!list.includes(v)) list.push(v);
  };
  const ev = (re: RegExp) =>
    files.filter((f) => re.test(f)).forEach((f) => add(hint.evidence, f));
  const pkg =
    packageJson && typeof packageJson === "object"
      ? (packageJson as Record<string, unknown>)
      : null;
  const deps = {
    ...((pkg?.dependencies as Record<string, string>) ?? {}),
    ...((pkg?.devDependencies as Record<string, string>) ?? {}),
  };
  const scripts = (pkg?.scripts as Record<string, string>) ?? {};
  const dep = (name: string) => name in deps;

  if (has(/package\.json$/)) {
    add(hint.languages, "javascript/typescript");
    ev(/package\.json$/);
    if (dep("vitest") || has(/vitest\.config\./)) {
      add(hint.runners, "vitest");
      hint.suggestions.push({
        kind: "unit",
        name: "Vitest unit tests",
        command:
          "npx vitest run --reporter=junit --outputFile=.neotest/results/vitest-junit.xml --coverage --coverage.reporter=lcov --coverage.reportsDirectory=.neotest/results/coverage",
        results: [
          { path: ".neotest/results/vitest-junit.xml", format: "junit" },
          { path: ".neotest/results/coverage/lcov.info", format: "lcov" },
        ],
        why: "vitest is a dependency",
      });
    } else if (dep("jest") || has(/jest\.config\./)) {
      add(hint.runners, "jest");
      hint.suggestions.push({
        kind: "unit",
        name: "Jest unit tests",
        command:
          "npx jest --ci --json --outputFile=.neotest/results/jest.json --coverage --coverageReporters=lcov --coverageDirectory=.neotest/results/coverage",
        results: [
          { path: ".neotest/results/jest.json", format: "jest" },
          { path: ".neotest/results/coverage/lcov.info", format: "lcov" },
        ],
        why: "jest is a dependency",
      });
    } else if (scripts.test && !/no test specified/.test(scripts.test)) {
      hint.suggestions.push({
        kind: "unit",
        name: "npm test",
        command: "npm test",
        results: [],
        why: "package.json has a test script (add a JUnit reporter so results can be parsed)",
      });
    }
    if (dep("@playwright/test") || has(/playwright\.config\./)) {
      add(hint.runners, "playwright");
      hint.suggestions.push({
        kind: "e2e",
        name: "Playwright end-to-end",
        command:
          "PLAYWRIGHT_JUNIT_OUTPUT_NAME=.neotest/results/playwright-junit.xml npx playwright test --reporter=junit",
        results: [
          { path: ".neotest/results/playwright-junit.xml", format: "junit" },
        ],
        why: "@playwright/test is a dependency",
      });
    }
    if (dep("cypress") || has(/cypress\.config\./))
      add(hint.runners, "cypress");
    if (dep("@stryker-mutator/core") || has(/stryker\.conf/)) {
      add(hint.runners, "stryker");
      hint.suggestions.push({
        kind: "mutation",
        name: "Stryker mutation tests",
        command: "npx stryker run --reporters json",
        results: [
          { path: "reports/mutation/mutation.json", format: "stryker" },
        ],
        why: "Stryker is configured",
      });
    }
    hint.suggestions.push({
      kind: "security",
      name: "npm audit",
      command: "npm audit --json > .neotest/results/npm-audit.json || true",
      results: [
        { path: ".neotest/results/npm-audit.json", format: "npm_audit" },
      ],
      why: "every npm project can audit its dependencies",
    });
    for (const fw of [
      "react",
      "vue",
      "svelte",
      "next",
      "express",
      "fastify",
      "hono",
      "nestjs",
      "@nestjs/core",
      "koa",
    ]) {
      if (dep(fw)) add(hint.frameworks, fw.replace("@nestjs/core", "nestjs"));
    }
  }
  if (
    has(
      /pyproject\.toml$|setup\.py$|requirements.*\.txt$|pytest\.ini$|tox\.ini$/,
    )
  ) {
    add(hint.languages, "python");
    add(hint.runners, "pytest");
    ev(/pyproject\.toml$|pytest\.ini$|tox\.ini$|requirements.*\.txt$/);
    hint.suggestions.push({
      kind: "unit",
      name: "pytest",
      command:
        "python -m pytest -q --junitxml=.neotest/results/pytest-junit.xml --cov=. --cov-report=xml:.neotest/results/coverage.xml",
      results: [
        { path: ".neotest/results/pytest-junit.xml", format: "junit" },
        { path: ".neotest/results/coverage.xml", format: "cobertura" },
      ],
      why: "a Python project (pytest + pytest-cov; install them if missing)",
    });
    hint.suggestions.push({
      kind: "security",
      name: "pip-audit",
      command:
        "python -m pip_audit -f json -o .neotest/results/pip-audit.json || true",
      results: [
        { path: ".neotest/results/pip-audit.json", format: "pip_audit" },
      ],
      why: "pip-audit checks installed packages against known CVEs",
    });
  }
  if (has(/go\.mod$/)) {
    add(hint.languages, "go");
    add(hint.runners, "go test");
    ev(/go\.mod$/);
    hint.suggestions.push({
      kind: "unit",
      name: "go test",
      command:
        "go test ./... -json -coverprofile=.neotest/results/cover.out > .neotest/results/gotest.json; go tool cover -func=.neotest/results/cover.out > .neotest/results/cover.txt || true",
      results: [{ path: ".neotest/results/gotest.json", format: "gotest" }],
      why: "a Go module",
    });
  }
  if (has(/Cargo\.toml$/)) add(hint.languages, "rust");
  if (has(/pom\.xml$|build\.gradle/)) {
    add(hint.languages, "java/kotlin");
    add(hint.runners, has(/pom\.xml$/) ? "maven surefire" : "gradle test");
    hint.suggestions.push({
      kind: "unit",
      name: has(/pom\.xml$/) ? "Maven tests" : "Gradle tests",
      command: has(/pom\.xml$/) ? "mvn -B -q test" : "./gradlew test",
      results: [
        {
          path: has(/pom\.xml$/)
            ? "target/surefire-reports/TEST-*.xml"
            : "build/test-results/test/TEST-*.xml",
          format: "junit",
        },
      ],
      why: "JUnit XML is written by default",
    });
  }
  if (has(/\.csproj$/)) add(hint.languages, "c#");
  if (has(/Gemfile$/)) add(hint.languages, "ruby");
  if (has(/composer\.json$/)) add(hint.languages, "php");
  if (has(/k6.*\.js$/)) {
    add(hint.runners, "k6");
    hint.suggestions.push({
      kind: "performance",
      name: "k6 load test",
      command:
        "k6 run --summary-export=.neotest/results/k6-summary.json <script>",
      results: [{ path: ".neotest/results/k6-summary.json", format: "k6" }],
      why: "a k6 script exists",
    });
  }
  if (has(/locustfile\.py$/)) add(hint.runners, "locust");
  if (has(/openapi\.|swagger\./)) {
    add(hint.frameworks, "openapi");
    ev(/openapi\.|swagger\./);
  }
  if (has(/schema\.prisma$/)) add(hint.frameworks, "prisma");
  if (has(/great_expectations\.yml$/)) add(hint.runners, "great_expectations");
  if (has(/soda.*\.yml$/)) add(hint.runners, "soda");
  if (has(/docker-compose/)) add(hint.frameworks, "docker-compose");
  hint.ci = files.filter((f) =>
    /\.github\/workflows\/|\.gitlab-ci\.yml|Jenkinsfile|\.circleci/.test(f),
  );
  return hint;
}
