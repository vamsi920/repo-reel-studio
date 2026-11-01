/**
 * Parsers for the MIT-first catalog tools: oha, vegeta, bombardier (load),
 * Lighthouse and pa11y (accessibility), gitleaks, nuclei, cargo-audit,
 * govulncheck, osv-scanner (security), cargo-mutants (mutation),
 * BackstopJS (visual regression as test cases) and CTRF (the common test
 * report format every runner can be converted to).
 */
import type {
  AccessibilityViolation,
  MutationSummary,
  PerfScenario,
  SecurityFinding,
  Severity,
  TestCase,
} from "../model";
import { slugId } from "../model";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json =>
  !!v && typeof v === "object" && !Array.isArray(v);
const asNum = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const asStr = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
const secToMs = (v: number | undefined) =>
  v === undefined ? undefined : v * 1000;
const nsToMs = (v: number | undefined) =>
  v === undefined ? undefined : v / 1e6;

function severityOf(value: unknown): Severity {
  const s = String(value ?? "").toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high" || s === "error") return "high";
  if (s === "medium" || s === "moderate" || s === "warning") return "medium";
  if (s === "low") return "low";
  return "info";
}

/* ── oha ───────────────────────────────────────────────────────────────── */

export function looksLikeOha(json: unknown): json is Json {
  return (
    isObj(json) &&
    isObj(json.summary) &&
    "requestsPerSec" in json.summary &&
    "latencyPercentiles" in json
  );
}

export function parseOha(json: Json, name = "oha"): PerfScenario[] {
  const summary = json.summary as Json;
  const pct = isObj(json.latencyPercentiles)
    ? (json.latencyPercentiles as Json)
    : {};
  const codes = isObj(json.statusCodeDistribution)
    ? (json.statusCodeDistribution as Json)
    : {};
  let total = 0;
  let bad = 0;
  for (const [code, count] of Object.entries(codes)) {
    const n = asNum(count) ?? 0;
    total += n;
    if (!/^2|^3/.test(code)) bad += n;
  }
  const errorCount = isObj(json.errorDistribution)
    ? Object.values(json.errorDistribution as Json).reduce<number>(
        (a, v) => a + (asNum(v) ?? 0),
        0,
      )
    : 0;
  return [
    {
      name,
      requests: total || (asNum(summary.total) ?? 0),
      rps: asNum(summary.requestsPerSec),
      errorRate:
        total + errorCount > 0
          ? ((bad + errorCount) / (total + errorCount)) * 100
          : undefined,
      p50Ms: secToMs(asNum(pct.p50)),
      p90Ms: secToMs(asNum(pct.p90)),
      p95Ms: secToMs(asNum(pct.p95)),
      p99Ms: secToMs(asNum(pct.p99)),
      maxMs: secToMs(asNum(summary.slowest)),
      durationMs: secToMs(asNum(summary.total)),
      thresholds: [],
      source: "oha",
    },
  ];
}

/* ── vegeta ────────────────────────────────────────────────────────────── */

export function looksLikeVegeta(json: unknown): json is Json {
  return (
    isObj(json) &&
    isObj(json.latencies) &&
    "50th" in json.latencies &&
    "requests" in json
  );
}

export function parseVegeta(json: Json, name = "vegeta"): PerfScenario[] {
  const lat = json.latencies as Json;
  const requests = asNum(json.requests) ?? 0;
  const success = asNum(json.success);
  return [
    {
      name,
      requests,
      rps: asNum(json.throughput) ?? asNum(json.rate),
      errorRate: success !== undefined ? (1 - success) * 100 : undefined,
      p50Ms: nsToMs(asNum(lat["50th"])),
      p90Ms: nsToMs(asNum(lat["90th"])),
      p95Ms: nsToMs(asNum(lat["95th"])),
      p99Ms: nsToMs(asNum(lat["99th"])),
      maxMs: nsToMs(asNum(lat.max)),
      durationMs: nsToMs(asNum(json.duration)),
      thresholds: [],
      source: "vegeta",
    },
  ];
}

/* ── bombardier ────────────────────────────────────────────────────────── */

export function looksLikeBombardier(json: unknown): json is Json {
  return (
    isObj(json) &&
    isObj(json.result) &&
    isObj((json.result as Json).latency) &&
    "req2xx" in (json.result as Json)
  );
}

export function parseBombardier(
  json: Json,
  name = "bombardier",
): PerfScenario[] {
  const result = json.result as Json;
  const latency = result.latency as Json;
  const pct = isObj(latency.percentiles) ? (latency.percentiles as Json) : {};
  const spec = isObj(json.spec) ? (json.spec as Json) : {};
  const ok = (asNum(result.req2xx) ?? 0) + (asNum(result.req3xx) ?? 0);
  const bad =
    (asNum(result.req1xx) ?? 0) +
    (asNum(result.req4xx) ?? 0) +
    (asNum(result.req5xx) ?? 0) +
    (asNum(result.others) ?? 0);
  const total = ok + bad;
  const us = (v: number | undefined) =>
    v === undefined ? undefined : v / 1000;
  return [
    {
      name: asStr(spec.url) ?? name,
      requests: total,
      rps:
        asNum(result.rps) !== undefined
          ? asNum((result.rps as Json).mean)
          : undefined,
      errorRate: total > 0 ? (bad / total) * 100 : undefined,
      p50Ms: us(asNum(pct["50"])),
      p90Ms: us(asNum(pct["90"])),
      p95Ms: us(asNum(pct["95"])),
      p99Ms: us(asNum(pct["99"])),
      maxMs: us(asNum(latency.max)),
      vus: asNum(spec.numberOfConnections),
      durationMs: secToMs(asNum(result.timeTakenSeconds)),
      thresholds: [],
      source: "bombardier",
    },
  ];
}

/* ── Lighthouse ────────────────────────────────────────────────────────── */

export function looksLikeLighthouse(json: unknown): json is Json {
  return (
    isObj(json) &&
    isObj(json.categories) &&
    isObj(json.audits) &&
    "lighthouseVersion" in json
  );
}

export function parseLighthouse(json: Json): {
  accessibility: AccessibilityViolation[];
  perf: PerfScenario[];
} {
  const url = asStr(json.finalDisplayedUrl) ?? asStr(json.requestedUrl);
  const audits = json.audits as Record<string, Json>;
  const categories = json.categories as Record<string, Json>;
  const accessibility: AccessibilityViolation[] = [];
  const a11yRefs = Array.isArray(categories.accessibility?.auditRefs)
    ? (categories.accessibility.auditRefs as Json[])
    : [];
  for (const ref of a11yRefs) {
    const id = asStr(ref.id);
    const audit = id ? audits[id] : undefined;
    if (audit?.score !== 0) continue;
    const items =
      isObj(audit.details) && Array.isArray((audit.details as Json).items)
        ? ((audit.details as Json).items as unknown[])
        : [];
    const weight = asNum(ref.weight) ?? 0;
    accessibility.push({
      id: slugId(`${url ?? ""} ${id}`),
      rule: id ?? "audit",
      impact:
        weight >= 10
          ? "critical"
          : weight >= 7
            ? "serious"
            : weight >= 3
              ? "moderate"
              : "minor",
      description: asStr(audit.title) ?? id ?? "",
      nodes: items.length,
      page: url,
    });
  }
  const perf: PerfScenario[] = [];
  const perfScore = asNum(categories.performance?.score);
  if (perfScore !== undefined) {
    const metric = (key: string) => asNum(audits[key]?.numericValue);
    perf.push({
      name: `lighthouse ${url ?? ""}`.trim(),
      requests: 1,
      p50Ms: metric("largest-contentful-paint"),
      p95Ms: metric("interactive") ?? metric("largest-contentful-paint"),
      thresholds: [
        {
          expr: `performance score ${Math.round(perfScore * 100)} >= 90`,
          passed: perfScore >= 0.9,
        },
      ],
      source: "lighthouse",
    });
  }
  return { accessibility, perf };
}

/* ── pa11y ─────────────────────────────────────────────────────────────── */

export function looksLikePa11y(json: unknown): boolean {
  if (Array.isArray(json))
    return (
      json.length > 0 &&
      json.every(
        (i) => isObj(i) && "code" in i && "type" in i && "selector" in i,
      )
    );
  return isObj(json) && Array.isArray(json.issues) && "pageUrl" in json;
}

export function parsePa11y(json: unknown): AccessibilityViolation[] {
  const page = isObj(json) ? asStr(json.pageUrl) : undefined;
  const issues: unknown[] = Array.isArray(json)
    ? json
    : isObj(json) && Array.isArray(json.issues)
      ? json.issues
      : [];
  const byCode = new Map<string, AccessibilityViolation>();
  for (const issue of issues) {
    if (!isObj(issue)) continue;
    const code = asStr(issue.code) ?? "rule";
    const type = asStr(issue.type) ?? "error";
    const existing = byCode.get(code);
    if (existing) {
      existing.nodes += 1;
      continue;
    }
    byCode.set(code, {
      id: slugId(`${page ?? ""} ${code}`),
      rule: code,
      impact:
        type === "error"
          ? "serious"
          : type === "warning"
            ? "moderate"
            : "minor",
      description: asStr(issue.message) ?? code,
      nodes: 1,
      page,
    });
  }
  return [...byCode.values()];
}

/* ── gitleaks ──────────────────────────────────────────────────────────── */

export function looksLikeGitleaks(json: unknown): json is Json[] {
  return (
    Array.isArray(json) &&
    json.every((i) => isObj(i) && "RuleID" in i && "File" in i)
  );
}

export function parseGitleaks(json: Json[]): SecurityFinding[] {
  return json.map((f) => ({
    id: slugId(`gitleaks ${f.RuleID} ${f.File} ${f.StartLine}`),
    title: `${asStr(f.Description) ?? asStr(f.RuleID) ?? "secret"} in ${asStr(f.File) ?? "?"}`,
    // A committed secret is always high: it must be rotated.
    severity: "high",
    tool: "gitleaks",
    file: asStr(f.File),
    line: asNum(f.StartLine),
  }));
}

/* ── nuclei (JSONL) ────────────────────────────────────────────────────── */

export function looksLikeNuclei(text: string): boolean {
  const first = text.trimStart().split("\n", 1)[0];
  return (
    first.startsWith("{") &&
    /"template-id"\s*:/.test(first) &&
    /"matched-at"\s*:/.test(first)
  );
}

export function parseNuclei(text: string): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const f = JSON.parse(trimmed) as Json;
      const info = isObj(f.info) ? (f.info as Json) : {};
      out.push({
        id: slugId(`nuclei ${f["template-id"]} ${f["matched-at"]}`),
        title: `${asStr(info.name) ?? asStr(f["template-id"]) ?? "finding"} at ${asStr(f["matched-at"]) ?? ""}`,
        severity: severityOf(info.severity),
        tool: "nuclei",
        url: asStr(f["matched-at"]),
      });
    } catch {
      // skip malformed line
    }
  }
  return out;
}

/* ── cargo-audit ───────────────────────────────────────────────────────── */

export function looksLikeCargoAudit(json: unknown): json is Json {
  return isObj(json) && isObj(json.vulnerabilities) && "lockfile" in json;
}

export function parseCargoAudit(json: Json): SecurityFinding[] {
  const list = Array.isArray((json.vulnerabilities as Json).list)
    ? ((json.vulnerabilities as Json).list as Json[])
    : [];
  return list.map((v) => {
    const advisory = isObj(v.advisory) ? (v.advisory as Json) : {};
    const pkg = isObj(v.package) ? (v.package as Json) : {};
    const versions = isObj(v.versions) ? (v.versions as Json) : {};
    return {
      id: slugId(`cargo ${pkg.name} ${advisory.id}`),
      title: `${asStr(advisory.id) ?? "advisory"}: ${asStr(advisory.title) ?? asStr(pkg.name) ?? ""}`,
      severity: asStr(advisory.cvss) ? "high" : "medium",
      tool: "cargo-audit",
      package: asStr(pkg.name),
      version: asStr(pkg.version),
      fixedIn: Array.isArray(versions.patched)
        ? versions.patched.join(", ")
        : undefined,
      url: asStr(advisory.url),
    };
  });
}

/* ── govulncheck (NDJSON) ──────────────────────────────────────────────── */

export function looksLikeGovulncheck(text: string): boolean {
  return (
    /"finding"\s*:\s*\{/.test(text) &&
    /"osv"\s*:/.test(text) &&
    /"trace"\s*:/.test(text)
  );
}

export function parseGovulncheck(text: string): SecurityFinding[] {
  const osv = new Map<string, Json>();
  const findings: SecurityFinding[] = [];
  // Objects may span lines: split on top-level "}\n{" boundaries.
  const chunks = text.split(/\n(?=\{)/);
  for (const chunk of chunks) {
    try {
      const entry = JSON.parse(chunk) as Json;
      if (isObj(entry.osv)) {
        const o = entry.osv as Json;
        if (asStr(o.id)) osv.set(asStr(o.id)!, o);
      }
      if (isObj(entry.finding)) {
        const f = entry.finding as Json;
        const id = asStr(f.osv) ?? "GO-?";
        const trace = Array.isArray(f.trace) ? (f.trace as Json[]) : [];
        const mod = trace[0] && isObj(trace[0]) ? trace[0] : {};
        const details = osv.get(id);
        if (findings.some((x) => x.id === slugId(`govuln ${id} ${mod.module}`)))
          continue;
        findings.push({
          id: slugId(`govuln ${id} ${mod.module}`),
          title: `${id}: ${asStr(details?.summary) ?? asStr(mod.module) ?? ""}`,
          severity: "high",
          tool: "govulncheck",
          package: asStr(mod.module),
          version: asStr(mod.version),
          fixedIn: asStr(f.fixed_version),
        });
      }
    } catch {
      // skip
    }
  }
  return findings;
}

/* ── osv-scanner ───────────────────────────────────────────────────────── */

export function looksLikeOsvScanner(json: unknown): json is Json {
  return (
    isObj(json) &&
    Array.isArray(json.results) &&
    json.results.every((r) => isObj(r) && Array.isArray(r.packages))
  );
}

export function parseOsvScanner(json: Json): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  for (const result of json.results as Json[]) {
    const source = isObj(result.source)
      ? asStr((result.source as Json).path)
      : undefined;
    for (const p of result.packages as unknown[]) {
      if (!isObj(p)) continue;
      const pkg = isObj(p.package) ? (p.package as Json) : {};
      for (const v of Array.isArray(p.vulnerabilities)
        ? (p.vulnerabilities as Json[])
        : []) {
        const sev =
          Array.isArray(v.severity) && isObj(v.severity[0])
            ? asStr((v.severity[0] as Json).score)
            : undefined;
        const dbSev = isObj(v.database_specific)
          ? asStr((v.database_specific as Json).severity)
          : undefined;
        out.push({
          id: slugId(`osv ${pkg.name} ${v.id}`),
          title: `${asStr(v.id) ?? "vuln"}: ${asStr(v.summary) ?? asStr(pkg.name) ?? ""}`,
          severity: dbSev ? severityOf(dbSev) : sev ? "high" : "medium",
          tool: "osv-scanner",
          package: asStr(pkg.name),
          version: asStr(pkg.version),
          file: source,
        });
      }
    }
  }
  return out;
}

/* ── cargo-mutants ─────────────────────────────────────────────────────── */

export function looksLikeCargoMutants(json: unknown): json is Json {
  return isObj(json) && Array.isArray(json.outcomes) && "total_mutants" in json;
}

export function parseCargoMutants(json: Json): MutationSummary {
  const outcomes = json.outcomes as Json[];
  const killed =
    asNum(json.caught) ??
    outcomes.filter((o) => o.summary === "CaughtMutant").length;
  const survivedList = outcomes.filter((o) => o.summary === "MissedMutant");
  const timeout =
    asNum(json.timeout) ??
    outcomes.filter((o) => o.summary === "Timeout").length;
  const unviable =
    asNum(json.unviable) ??
    outcomes.filter((o) => o.summary === "Unviable").length;
  const total = asNum(json.total_mutants) ?? outcomes.length;
  const detectable = killed + survivedList.length + timeout;
  return {
    total,
    killed,
    survived: survivedList.length,
    timeout,
    noCoverage: unviable,
    score: detectable > 0 ? ((killed + timeout) / detectable) * 100 : undefined,
    survivors: survivedList.slice(0, 50).map((o) => {
      const scenario =
        isObj(o.scenario) && isObj((o.scenario as Json).Mutant)
          ? ((o.scenario as Json).Mutant as Json)
          : {};
      return {
        file: asStr(scenario.file) ?? "?",
        line: isObj(scenario.span)
          ? asNum(((scenario.span as Json).start as Json | undefined)?.line)
          : undefined,
        mutator: asStr(scenario.replacement)
          ? `→ ${asStr(scenario.replacement)}`
          : undefined,
        description: asStr(scenario.function)
          ? `in ${asStr(scenario.function)}`
          : undefined,
      };
    }),
    source: "cargo_mutants",
  };
}

/* ── BackstopJS ────────────────────────────────────────────────────────── */

export function looksLikeBackstop(json: unknown): json is Json {
  return (
    isObj(json) &&
    Array.isArray(json.tests) &&
    json.tests.every((t) => isObj(t) && isObj(t.pair) && "status" in t)
  );
}

export function parseBackstop(json: Json): TestCase[] {
  return (json.tests as Json[]).map((t) => {
    const pair = t.pair as Json;
    const label =
      `${asStr(pair.label) ?? "scenario"} @ ${asStr(pair.viewportLabel) ?? ""}`.trim();
    const diff = isObj(pair.diff) ? (pair.diff as Json) : {};
    return {
      id: slugId(`visual ${label}`),
      name: label,
      suite: "visual",
      status: t.status === "pass" ? "passed" : "failed",
      message:
        t.status === "pass"
          ? undefined
          : `${diff.misMatchPercentage !== undefined && diff.misMatchPercentage !== null ? `${diff.misMatchPercentage}% mismatch` : "visual difference"} (${asStr(pair.diffImage) ?? asStr(pair.test) ?? ""})`,
    };
  });
}

/* ── CTRF ──────────────────────────────────────────────────────────────── */

export function looksLikeCtrf(json: unknown): json is Json {
  return (
    isObj(json) &&
    isObj(json.results) &&
    Array.isArray((json.results as Json).tests) &&
    isObj((json.results as Json).summary)
  );
}

export function parseCtrf(json: Json): {
  cases: TestCase[];
  warnings: string[];
} {
  const results = json.results as Json;
  const tests = results.tests as Json[];
  const cases: TestCase[] = tests.map((t, i) => {
    const status = asStr(t.status) ?? "other";
    const retries = asNum(t.retries) ?? 0;
    const flaky = t.flaky === true || (status === "passed" && retries > 0);
    return {
      id: slugId(`${t.suite ?? t.filePath ?? ""} ${t.name ?? i}`),
      name: asStr(t.name) ?? `test ${i + 1}`,
      suite: asStr(t.suite),
      file: asStr(t.filePath),
      line: asNum(t.line),
      status: flaky
        ? "flaky"
        : status === "passed"
          ? "passed"
          : status === "failed"
            ? "failed"
            : status === "skipped" || status === "pending"
              ? "skipped"
              : "error",
      durationMs: asNum(t.duration),
      retries: retries || undefined,
      message: asStr(t.message)?.slice(0, 400),
      details: asStr(t.trace)?.slice(0, 1200),
    };
  });
  return { cases, warnings: cases.length ? [] : ["ctrf: no tests"] };
}
