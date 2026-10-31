/**
 * Performance (k6 summary, autocannon), accessibility (axe-core), security
 * (npm audit, pip-audit, semgrep, trivy), data checks (Neo Test checks.json,
 * Great Expectations) and mutation (Stryker, the harness's mutation.json).
 */
import type {
  AccessibilityViolation,
  DataCheck,
  HarnessMutation,
  MutationSummary,
  PerfScenario,
  SecurityFinding,
  Severity,
} from "../model";
import { slugId } from "../model";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json =>
  !!v && typeof v === "object" && !Array.isArray(v);
const asNum = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const asStr = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

function severityOf(value: unknown): Severity {
  const s = String(value ?? "").toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high" || s === "error") return "high";
  if (s === "moderate" || s === "medium" || s === "warning") return "medium";
  if (s === "low") return "low";
  return "info";
}

/* ── k6 summary (handleSummary / --summary-export) ─────────────────────── */

export function looksLikeK6(json: unknown): json is Json {
  return (
    isObj(json) && isObj(json.metrics) && "http_req_duration" in json.metrics
  );
}

function k6Values(metric: unknown): Json {
  if (!isObj(metric)) return {};
  return isObj(metric.values) ? (metric.values as Json) : metric;
}

export function parseK6(json: Json, name = "k6"): PerfScenario[] {
  const metrics = json.metrics as Json;
  const dur = k6Values(metrics.http_req_duration);
  const reqs = k6Values(metrics.http_reqs);
  const failed = k6Values(metrics.http_req_failed);
  const vus = k6Values(metrics.vus_max ?? metrics.vus);
  const thresholds: PerfScenario["thresholds"] = [];
  for (const [metricName, metric] of Object.entries(metrics)) {
    if (!isObj(metric) || !isObj(metric.thresholds)) continue;
    for (const [expr, t] of Object.entries(metric.thresholds as Json)) {
      const ok: unknown = isObj(t) ? t.ok : t;
      // k6 writes {ok: boolean}; older exports wrote the bare boolean.
      thresholds.push({
        expr: `${metricName}: ${expr}`,
        passed: ok === true || ok === "true",
      });
    }
  }
  const state = isObj(json.state) ? (json.state as Json) : {};
  const durationMs = asNum(state.testRunDurationMs);
  return [
    {
      name,
      requests: asNum(reqs.count) ?? 0,
      rps: asNum(reqs.rate),
      errorRate:
        asNum(failed.value) !== undefined
          ? asNum(failed.value)! * 100
          : asNum(failed.rate) !== undefined
            ? asNum(failed.rate)! * 100
            : undefined,
      p50Ms: asNum(dur.med) ?? asNum(dur["p(50)"]),
      p90Ms: asNum(dur["p(90)"]),
      p95Ms: asNum(dur["p(95)"]),
      p99Ms: asNum(dur["p(99)"]),
      maxMs: asNum(dur.max),
      vus: asNum(vus.max) ?? asNum(vus.value),
      durationMs,
      thresholds,
      source: "k6",
    },
  ];
}

/* ── autocannon JSON ───────────────────────────────────────────────────── */

export function looksLikeAutocannon(json: unknown): json is Json {
  return (
    isObj(json) &&
    isObj(json.latency) &&
    isObj(json.requests) &&
    "p99" in json.latency
  );
}

export function parseAutocannon(
  json: Json,
  name = "autocannon",
): PerfScenario[] {
  const latency = json.latency as Json;
  const requests = json.requests as Json;
  const total = asNum(requests.total) ?? 0;
  const errors = (asNum(json.errors) ?? 0) + (asNum(json.non2xx) ?? 0);
  return [
    {
      name: asStr(json.url) ?? name,
      requests: total,
      rps: asNum(requests.average),
      errorRate: total > 0 ? (errors / total) * 100 : undefined,
      p50Ms: asNum(latency.p50),
      p90Ms: asNum(latency.p90),
      p95Ms: asNum(latency.p95) ?? asNum(latency.p97_5),
      p99Ms: asNum(latency.p99),
      maxMs: asNum(latency.max),
      vus: asNum(json.connections),
      durationMs:
        asNum(json.duration) !== undefined
          ? asNum(json.duration)! * 1000
          : undefined,
      thresholds: [],
      source: "autocannon",
    },
  ];
}

/* ── axe-core ──────────────────────────────────────────────────────────── */

export function looksLikeAxe(json: unknown): boolean {
  const first = Array.isArray(json) ? json[0] : json;
  return (
    isObj(first) &&
    Array.isArray(first.violations) &&
    ("passes" in first || "url" in first)
  );
}

export function parseAxe(json: unknown): AccessibilityViolation[] {
  const results = Array.isArray(json) ? json : [json];
  const out: AccessibilityViolation[] = [];
  for (const result of results) {
    if (!isObj(result) || !Array.isArray(result.violations)) continue;
    const page = asStr(result.url);
    for (const v of result.violations) {
      if (!isObj(v)) continue;
      const impact = String(
        v.impact ?? "minor",
      ) as AccessibilityViolation["impact"];
      out.push({
        id: slugId(`${page ?? ""} ${v.id}`),
        rule: asStr(v.id) ?? "rule",
        impact: ["critical", "serious", "moderate", "minor"].includes(impact)
          ? impact
          : "minor",
        description: asStr(v.help) ?? asStr(v.description) ?? "",
        nodes: Array.isArray(v.nodes) ? v.nodes.length : 0,
        page,
        helpUrl: asStr(v.helpUrl),
      });
    }
  }
  return out;
}

/* ── npm audit / pip-audit / semgrep / trivy ───────────────────────────── */

export function looksLikeNpmAudit(json: unknown): json is Json {
  return isObj(json) && isObj(json.vulnerabilities) && isObj(json.metadata);
}

export function parseNpmAudit(json: Json): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  for (const [pkg, v] of Object.entries(json.vulnerabilities as Json)) {
    if (!isObj(v)) continue;
    const via = Array.isArray(v.via) ? v.via.find(isObj) : undefined;
    out.push({
      id: slugId(`npm ${pkg} ${asStr(via?.title) ?? ""}`),
      title:
        asStr(via?.title) ?? `${pkg}: ${asStr(v.severity) ?? "vulnerability"}`,
      severity: severityOf(v.severity),
      tool: "npm audit",
      package: pkg,
      version: asStr(v.range),
      fixedIn: isObj(v.fixAvailable)
        ? asStr((v.fixAvailable as Json).version)
        : v.fixAvailable === true
          ? "available"
          : undefined,
      url: asStr(via?.url),
    });
  }
  return out;
}

export function looksLikePipAudit(json: unknown): json is Json {
  return (
    isObj(json) &&
    Array.isArray(json.dependencies) &&
    json.dependencies.some((d) => isObj(d) && "vulns" in d)
  );
}

export function parsePipAudit(json: Json): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  for (const dep of json.dependencies as unknown[]) {
    if (!isObj(dep) || !Array.isArray(dep.vulns)) continue;
    for (const v of dep.vulns) {
      if (!isObj(v)) continue;
      out.push({
        id: slugId(`pip ${dep.name} ${v.id}`),
        title: `${asStr(v.id) ?? "vuln"}: ${asStr(v.description)?.slice(0, 120) ?? dep.name}`,
        // pip-audit has no severity; treat every known CVE as high.
        severity: "high",
        tool: "pip-audit",
        package: asStr(dep.name),
        version: asStr(dep.version),
        fixedIn: Array.isArray(v.fix_versions)
          ? v.fix_versions.join(", ")
          : undefined,
      });
    }
  }
  return out;
}

export function looksLikeSemgrep(json: unknown): json is Json {
  return (
    isObj(json) &&
    Array.isArray(json.results) &&
    "errors" in json &&
    json.results.every((r) => isObj(r) && "check_id" in r)
  );
}

export function parseSemgrep(json: Json): SecurityFinding[] {
  return (json.results as Json[]).map((r) => {
    const extra = isObj(r.extra) ? (r.extra as Json) : {};
    const start = isObj(r.start) ? (r.start as Json) : {};
    return {
      id: slugId(`semgrep ${r.check_id} ${r.path} ${start.line}`),
      title:
        asStr(extra.message)?.slice(0, 160) ?? asStr(r.check_id) ?? "finding",
      severity: severityOf(extra.severity),
      tool: "semgrep",
      file: asStr(r.path),
      line: asNum(start.line),
    };
  });
}

export function looksLikeTrivy(json: unknown): json is Json {
  return (
    isObj(json) &&
    Array.isArray(json.Results) &&
    ("SchemaVersion" in json || "ArtifactName" in json)
  );
}

export function parseTrivy(json: Json): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  for (const result of json.Results as unknown[]) {
    if (!isObj(result) || !Array.isArray(result.Vulnerabilities)) continue;
    for (const v of result.Vulnerabilities) {
      if (!isObj(v)) continue;
      out.push({
        id: slugId(`trivy ${v.PkgName} ${v.VulnerabilityID}`),
        title: `${asStr(v.VulnerabilityID) ?? "vuln"}: ${asStr(v.Title) ?? asStr(v.PkgName) ?? ""}`,
        severity: severityOf(v.Severity),
        tool: "trivy",
        package: asStr(v.PkgName),
        version: asStr(v.InstalledVersion),
        fixedIn: asStr(v.FixedVersion),
        url: asStr(v.PrimaryURL),
        file: asStr(result.Target),
      });
    }
  }
  return out;
}

/* ── Data checks ───────────────────────────────────────────────────────── */

/**
 * Neo Test's own format, documented to the agent by `describe`:
 * `{ "checks": [{ "name", "dataset"?, "column"?, "status": "pass|warn|fail|error",
 *    "severity"?: "critical|high|medium|low", "metric"?, "expected"?,
 *    "unexpected_count"?, "unexpected_percent"?, "message"? }] }`
 */
export function looksLikeNeotestChecks(json: unknown): json is Json {
  return (
    isObj(json) &&
    Array.isArray(json.checks) &&
    json.checks.every((c) => isObj(c) && "status" in c && "name" in c)
  );
}

export function parseNeotestChecks(json: Json): DataCheck[] {
  return (json.checks as Json[]).map((c, i) => {
    const status = String(c.status).toLowerCase();
    return {
      id: slugId(`${c.dataset ?? ""} ${c.column ?? ""} ${c.name ?? i}`),
      name: asStr(c.name) ?? `check ${i + 1}`,
      dataset: asStr(c.dataset),
      column: asStr(c.column),
      status:
        status === "pass" || status === "passed"
          ? "pass"
          : status === "warn" || status === "warning"
            ? "warn"
            : status === "error"
              ? "error"
              : "fail",
      severity: c.severity ? severityOf(c.severity) : "high",
      metric: asNum(c.metric) ?? asStr(c.metric),
      expected: asStr(c.expected),
      unexpectedCount: asNum(c.unexpected_count),
      unexpectedPercent: asNum(c.unexpected_percent),
      message: asStr(c.message),
    };
  });
}

export function looksLikeGreatExpectations(json: unknown): json is Json {
  return (
    isObj(json) &&
    Array.isArray(json.results) &&
    json.results.every((r) => isObj(r) && isObj(r.expectation_config))
  );
}

export function parseGreatExpectations(json: Json): DataCheck[] {
  return (json.results as Json[]).map((r, i) => {
    const config = r.expectation_config as Json;
    const kwargs = isObj(config.kwargs) ? (config.kwargs as Json) : {};
    const result = isObj(r.result) ? (r.result as Json) : {};
    const type =
      asStr(config.expectation_type) ??
      asStr(config.type) ??
      `expectation ${i + 1}`;
    const column = asStr(kwargs.column);
    const meta = isObj(config.meta) ? (config.meta as Json) : {};
    return {
      id: slugId(`ge ${type} ${column ?? ""} ${i}`),
      name: type,
      column,
      dataset:
        asStr(json.data_asset_name) ??
        asStr(
          isObj(json.meta) ? (json.meta as Json).data_asset_name : undefined,
        ),
      status:
        r.success === true
          ? "pass"
          : r.exception_info &&
              isObj(r.exception_info) &&
              (r.exception_info as Json).raised_exception
            ? "error"
            : "fail",
      severity: meta.severity
        ? severityOf(meta.severity)
        : type.includes("unique") ||
            type.includes("not_be_null") ||
            type.includes("schema") ||
            type.includes("columns")
          ? "critical"
          : "high",
      metric: asNum(result.observed_value) ?? asStr(result.observed_value),
      unexpectedCount: asNum(result.unexpected_count),
      unexpectedPercent: asNum(result.unexpected_percent),
    };
  });
}

/* ── Mutation ──────────────────────────────────────────────────────────── */

export function looksLikeStryker(json: unknown): json is Json {
  return isObj(json) && isObj(json.files) && "schemaVersion" in json;
}

export function parseStryker(json: Json): MutationSummary {
  let killed = 0;
  let survived = 0;
  let timeout = 0;
  let noCoverage = 0;
  let total = 0;
  const survivors: MutationSummary["survivors"] = [];
  for (const [file, f] of Object.entries(json.files as Json)) {
    if (!isObj(f) || !Array.isArray(f.mutants)) continue;
    for (const m of f.mutants) {
      if (!isObj(m)) continue;
      total += 1;
      switch (m.status) {
        case "Killed":
          killed += 1;
          break;
        case "Survived":
          survived += 1;
          if (survivors.length < 50) {
            const loc =
              isObj(m.location) && isObj((m.location as Json).start)
                ? ((m.location as Json).start as Json)
                : {};
            survivors.push({
              file,
              line: asNum(loc.line),
              mutator: asStr(m.mutatorName),
              description: asStr(m.description),
            });
          }
          break;
        case "Timeout":
          timeout += 1;
          break;
        case "NoCoverage":
          noCoverage += 1;
          break;
        default:
          break;
      }
    }
  }
  const detectable = killed + survived + timeout;
  return {
    total,
    killed,
    survived,
    timeout,
    noCoverage,
    score: detectable > 0 ? ((killed + timeout) / detectable) * 100 : undefined,
    survivors,
    source: "stryker",
  };
}

export function looksLikeNeotestMutation(
  json: unknown,
): json is HarnessMutation {
  return (
    isObj(json) &&
    Array.isArray(json.mutants) &&
    "suiteId" in json &&
    "file" in json
  );
}

export function parseNeotestMutation(json: HarnessMutation): MutationSummary {
  const killed = json.mutants.filter((m) => m.killed).length;
  const survivors = json.mutants
    .filter((m) => !m.killed && !m.error)
    .map((m) => ({
      file: json.file,
      line: m.line,
      mutator: `${m.from} → ${m.to}`,
    }));
  const errored = json.mutants.filter((m) => m.error).length;
  const detectable = json.mutants.length - errored;
  return {
    total: json.mutants.length,
    killed,
    survived: survivors.length,
    timeout: 0,
    noCoverage: errored,
    score: detectable > 0 ? (killed / detectable) * 100 : undefined,
    survivors,
    source: "neotest_mutation",
  };
}
