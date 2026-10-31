/**
 * Test-result parsers: JUnit XML (every runner can emit it), Jest/Vitest
 * JSON reporters, pytest-json-report and `go test -json`. Each returns test
 * cases in the shared shape; a case with retries that ended green is
 * `flaky`, never `passed`.
 */
import type { CaseStatus, TestCase } from "../model";
import { slugId } from "../model";
import { child, num, parseXml, type XmlNode } from "./xml";

const MAX_DETAILS = 1200;

function clip(text: string | undefined, max = MAX_DETAILS): string | undefined {
  if (!text) return undefined;
  const t = text.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function caseId(parts: (string | undefined)[]): string {
  return slugId(parts.filter(Boolean).join(" ")) || "case";
}

/* ── JUnit ─────────────────────────────────────────────────────────────── */

export function looksLikeJunit(text: string): boolean {
  return /<testsuites?[\s>]/.test(text) && /<testcase[\s>/]/.test(text);
}

export function parseJunit(text: string): {
  cases: TestCase[];
  warnings: string[];
} {
  const root = parseXml(text);
  const warnings: string[] = [];
  if (!root) return { cases: [], warnings: ["junit: malformed XML"] };
  const cases: TestCase[] = [];
  const seen = new Map<string, TestCase>();
  // Cases live under <testsuite> in most runners, but Node's reporter puts
  // top-level tests straight under <testsuites>; walk every depth.
  const found: { tc: XmlNode; suite: XmlNode | null }[] = [];
  const walk = (node: XmlNode, suite: XmlNode | null) => {
    for (const child of node.children) {
      if (child.name === "testcase") found.push({ tc: child, suite });
      else walk(child, child.name === "testsuite" ? child : suite);
    }
  };
  if (root.name === "testcase") found.push({ tc: root, suite: null });
  else walk(root, root.name === "testsuite" ? root : null);
  {
    for (const { tc, suite } of found) {
      const suiteName = suite?.attrs.name;
      const name = tc.attrs.name ?? "(unnamed)";
      const classname = tc.attrs.classname;
      const file = tc.attrs.file ?? suite?.attrs.file;
      const line = num(tc.attrs.line);
      let status: CaseStatus = "passed";
      let message: string | undefined;
      let details: string | undefined;
      const failure = child(tc, "failure");
      const error = child(tc, "error");
      const skipped = child(tc, "skipped");
      if (failure) {
        status = "failed";
        message = failure.attrs.message ?? clip(failure.text, 200);
        details = clip(failure.text);
      } else if (error) {
        status = "error";
        message = error.attrs.message ?? clip(error.text, 200);
        details = clip(error.text);
      } else if (skipped) {
        status = "skipped";
        message = skipped.attrs.message;
      }
      const id = caseId([classname ?? suiteName, name]);
      // Playwright/JUnit retries repeat the same case; failed-then-passed is flaky.
      const prior = seen.get(id);
      if (prior) {
        prior.retries = (prior.retries ?? 0) + 1;
        if (prior.status !== "passed" && status === "passed")
          prior.status = "flaky";
        else if (status !== "passed" && prior.status === "passed")
          prior.status = "flaky";
        else if (status === "failed" || status === "error") {
          prior.status = status;
          prior.message = message ?? prior.message;
          prior.details = details ?? prior.details;
        }
        continue;
      }
      const result: TestCase = {
        id,
        name,
        suite: classname ?? suiteName,
        file,
        line,
        status,
        durationMs:
          num(tc.attrs.time) !== undefined
            ? Math.round(num(tc.attrs.time)! * 1000)
            : undefined,
        message: clip(message, 400),
        details,
      };
      // Some runners flag flaky in the system-out / properties.
      if (
        /\bflaky\b/i.test(tc.children.map((c) => c.attrs.name ?? "").join(" "))
      ) {
        result.status = result.status === "passed" ? "flaky" : result.status;
      }
      seen.set(id, result);
      cases.push(result);
    }
  }
  if (cases.length === 0) warnings.push("junit: no <testcase> elements");
  return { cases, warnings };
}

/* ── Jest / Vitest JSON ────────────────────────────────────────────────── */

interface JestAssertion {
  title?: string;
  fullName?: string;
  ancestorTitles?: string[];
  status?: string;
  duration?: number | null;
  failureMessages?: string[];
  invocations?: number;
  retryReasons?: string[];
  location?: { line?: number } | null;
}
interface JestFile {
  name?: string;
  testFilePath?: string;
  status?: string;
  message?: string;
  assertionResults?: JestAssertion[];
}
interface JestJson {
  numTotalTests?: number;
  testResults?: JestFile[];
}

export function looksLikeJest(json: unknown): json is JestJson {
  return (
    !!json &&
    typeof json === "object" &&
    Array.isArray((json as JestJson).testResults) &&
    ("numTotalTests" in (json as object) ||
      "numFailedTests" in (json as object))
  );
}

export function parseJest(json: JestJson): {
  cases: TestCase[];
  warnings: string[];
} {
  const cases: TestCase[] = [];
  const warnings: string[] = [];
  for (const file of json.testResults ?? []) {
    const path = file.name ?? file.testFilePath;
    const assertions = file.assertionResults ?? [];
    if (assertions.length === 0 && file.status === "failed") {
      cases.push({
        id: caseId([path, "suite"]),
        name: path ?? "(file)",
        file: path,
        status: "error",
        message: clip(file.message, 400),
        details: clip(file.message),
      });
      continue;
    }
    for (const a of assertions) {
      const name =
        a.fullName ?? [...(a.ancestorTitles ?? []), a.title ?? ""].join(" › ");
      let status: CaseStatus;
      switch (a.status) {
        case "passed":
          status = "passed";
          break;
        case "failed":
          status = "failed";
          break;
        case "pending":
        case "skipped":
        case "todo":
        case "disabled":
          status = "skipped";
          break;
        default:
          status = "error";
      }
      const retries =
        Math.max(0, (a.invocations ?? 1) - 1) || (a.retryReasons?.length ?? 0);
      if (status === "passed" && retries > 0) status = "flaky";
      cases.push({
        id: caseId([path, name]),
        name,
        suite: a.ancestorTitles?.[0],
        file: path,
        line: a.location?.line ?? undefined,
        status,
        durationMs:
          typeof a.duration === "number" ? Math.round(a.duration) : undefined,
        retries: retries || undefined,
        message: clip(a.failureMessages?.[0], 400),
        details: clip(a.failureMessages?.join("\n\n")),
      });
    }
  }
  if (cases.length === 0) warnings.push("jest: no assertion results");
  return { cases, warnings };
}

/* ── pytest-json-report ────────────────────────────────────────────────── */

interface PytestTest {
  nodeid?: string;
  lineno?: number;
  outcome?: string;
  duration?: number;
  call?: { duration?: number; longrepr?: string; crash?: { message?: string } };
  setup?: { outcome?: string; longrepr?: string };
  teardown?: { outcome?: string; longrepr?: string };
}
interface PytestJson {
  tests?: PytestTest[];
  summary?: Record<string, number>;
}

export function looksLikePytest(json: unknown): json is PytestJson {
  return (
    !!json &&
    typeof json === "object" &&
    Array.isArray((json as PytestJson).tests) &&
    (json as PytestJson).tests!.every(
      (t) => t && typeof t === "object" && "nodeid" in t,
    )
  );
}

export function parsePytest(json: PytestJson): {
  cases: TestCase[];
  warnings: string[];
} {
  const cases: TestCase[] = [];
  for (const t of json.tests ?? []) {
    const nodeid = t.nodeid ?? "(test)";
    const [file, ...rest] = nodeid.split("::");
    let status: CaseStatus;
    switch (t.outcome) {
      case "passed":
      case "xpassed":
        status = "passed";
        break;
      case "failed":
      case "xfailed":
        status = t.outcome === "xfailed" ? "skipped" : "failed";
        break;
      case "skipped":
        status = "skipped";
        break;
      case "error":
        status = "error";
        break;
      case "rerun":
        status = "flaky";
        break;
      default:
        status = "error";
    }
    if (
      status === "passed" &&
      (t.setup?.outcome === "failed" || t.teardown?.outcome === "failed")
    ) {
      status = "error";
    }
    const longrepr =
      t.call?.longrepr ?? t.setup?.longrepr ?? t.teardown?.longrepr;
    cases.push({
      id: caseId([nodeid]),
      name: rest.join("::") || nodeid,
      suite: rest.length > 1 ? rest[0] : undefined,
      file,
      line: typeof t.lineno === "number" ? t.lineno : undefined,
      status,
      durationMs:
        typeof t.duration === "number"
          ? Math.round(t.duration * 1000)
          : typeof t.call?.duration === "number"
            ? Math.round(t.call.duration * 1000)
            : undefined,
      message: clip(t.call?.crash?.message ?? longrepr, 400),
      details: clip(longrepr),
    });
  }
  return {
    cases,
    warnings: cases.length ? [] : ["pytest: no tests in report"],
  };
}

/* ── go test -json ─────────────────────────────────────────────────────── */

interface GoEvent {
  Action?: string;
  Package?: string;
  Test?: string;
  Elapsed?: number;
  Output?: string;
}

export function looksLikeGoTest(text: string): boolean {
  const first = text.trimStart().split("\n", 1)[0];
  return (
    first.startsWith("{") &&
    /"Action"\s*:/.test(first) &&
    /"Package"\s*:/.test(first)
  );
}

export function parseGoTest(text: string): {
  cases: TestCase[];
  warnings: string[];
} {
  const byKey = new Map<string, TestCase & { output: string[] }>();
  const warnings: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let event: GoEvent;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!event.Test) continue;
    const key = `${event.Package ?? ""}::${event.Test}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        id: caseId([event.Package, event.Test]),
        name: event.Test,
        suite: event.Package,
        status: "error",
        output: [],
      };
      byKey.set(key, entry);
    }
    switch (event.Action) {
      case "pass":
        entry.status = "passed";
        break;
      case "fail":
        entry.status = "failed";
        break;
      case "skip":
        entry.status = "skipped";
        break;
      case "output":
        if (event.Output) entry.output.push(event.Output);
        break;
      default:
        break;
    }
    if (typeof event.Elapsed === "number" && event.Action !== "output") {
      entry.durationMs = Math.round(event.Elapsed * 1000);
    }
  }
  const cases: TestCase[] = [];
  for (const entry of byKey.values()) {
    const { output, ...rest } = entry;
    const text = output.join("");
    if (rest.status !== "passed" && rest.status !== "skipped") {
      rest.message = clip(
        text.split("\n").find((l) => /Error|expected|got|want/i.test(l)) ??
          text,
        400,
      );
      rest.details = clip(text);
    }
    cases.push(rest);
  }
  if (cases.length === 0) warnings.push("gotest: no test events");
  return { cases, warnings };
}
