/**
 * Detects an artifact's format (by declared format, file name, then content)
 * and parses it into the shared shape. Never throws: an unreadable artifact
 * returns a warning and nothing else.
 */
import type { ArtifactFormat, ParsedArtifact } from "../model";
import {
  looksLikeCobertura,
  looksLikeCoveragePy,
  looksLikeIstanbulSummary,
  looksLikeLcov,
  parseCobertura,
  parseCoveragePy,
  parseIstanbulSummary,
  parseLcov,
} from "./coverage";
import {
  looksLikeAutocannon,
  looksLikeAxe,
  looksLikeGreatExpectations,
  looksLikeK6,
  looksLikeNeotestChecks,
  looksLikeNeotestMutation,
  looksLikeNpmAudit,
  looksLikePipAudit,
  looksLikeSemgrep,
  looksLikeStryker,
  looksLikeTrivy,
  parseAutocannon,
  parseAxe,
  parseGreatExpectations,
  parseK6,
  parseNeotestChecks,
  parseNeotestMutation,
  parseNpmAudit,
  parsePipAudit,
  parseSemgrep,
  parseStryker,
  parseTrivy,
} from "./quality";
import {
  looksLikeGoTest,
  looksLikeJest,
  looksLikeJunit,
  looksLikePytest,
  parseGoTest,
  parseJest,
  parseJunit,
  parsePytest,
} from "./results";

export * from "./results";
export * from "./coverage";
export * from "./quality";

function tryJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/** Best guess from the file name alone (used when content is ambiguous). */
export function formatFromName(path: string): ArtifactFormat | undefined {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  if (base === "lcov.info" || base.endsWith(".lcov")) return "lcov";
  if (base === "coverage-summary.json") return "istanbul_summary";
  if (base === "cobertura.xml" || base === "coverage.xml") return "cobertura";
  if (base === "coverage.json" || base === "coverage-py.json")
    return "coveragepy";
  if (base === "mutation.json" && path.includes(".neotest"))
    return "neotest_mutation";
  if (base === "checks.json") return "neotest_checks";
  if (base.includes("junit") || base.endsWith(".xml")) return "junit";
  if (base.includes("k6")) return "k6";
  if (base.includes("autocannon")) return "autocannon";
  if (base.includes("axe")) return "axe";
  if (base.includes("semgrep")) return "semgrep";
  if (base.includes("trivy")) return "trivy";
  if (base.includes("stryker") || base === "mutation-report.json")
    return "stryker";
  if (base.includes("pytest") || base === "report.json") return "pytest";
  return undefined;
}

/** Detects by content; `hint` (from the plan or the name) breaks ties. */
export function detectFormat(
  path: string,
  text: string,
  hint: ArtifactFormat = "auto",
): ArtifactFormat | undefined {
  if (hint !== "auto") return hint;
  const json = tryJson(text);
  if (json !== undefined) {
    if (looksLikeJest(json)) return "jest";
    if (looksLikePytest(json)) return "pytest";
    if (looksLikeIstanbulSummary(json)) return "istanbul_summary";
    if (looksLikeCoveragePy(json)) return "coveragepy";
    if (looksLikeK6(json)) return "k6";
    if (looksLikeAutocannon(json)) return "autocannon";
    if (looksLikeAxe(json)) return "axe";
    if (looksLikeNpmAudit(json)) return "npm_audit";
    if (looksLikePipAudit(json)) return "pip_audit";
    if (looksLikeSemgrep(json)) return "semgrep";
    if (looksLikeTrivy(json)) return "trivy";
    if (looksLikeNeotestMutation(json)) return "neotest_mutation";
    if (looksLikeStryker(json)) return "stryker";
    if (looksLikeNeotestChecks(json)) return "neotest_checks";
    if (looksLikeGreatExpectations(json)) return "great_expectations";
  } else {
    if (looksLikeJunit(text)) return "junit";
    if (looksLikeCobertura(text)) return "cobertura";
    if (looksLikeLcov(text)) return "lcov";
    if (looksLikeGoTest(text)) return "gotest";
  }
  return formatFromName(path);
}

export function parseArtifact(
  path: string,
  text: string,
  hint: ArtifactFormat = "auto",
): ParsedArtifact {
  const format = detectFormat(path, text, hint);
  const result: ParsedArtifact = {
    path,
    format: format ?? "auto",
    warnings: [],
  };
  if (!format) {
    result.warnings.push(`${path}: unrecognised format`);
    return result;
  }
  try {
    const json = tryJson(text);
    switch (format) {
      case "junit": {
        const r = parseJunit(text);
        result.cases = r.cases;
        result.warnings.push(...r.warnings);
        break;
      }
      case "jest": {
        if (!looksLikeJest(json)) throw new Error("not a jest report");
        const r = parseJest(json);
        result.cases = r.cases;
        result.warnings.push(...r.warnings);
        break;
      }
      case "pytest": {
        if (!looksLikePytest(json)) throw new Error("not a pytest-json-report");
        const r = parsePytest(json);
        result.cases = r.cases;
        result.warnings.push(...r.warnings);
        break;
      }
      case "gotest": {
        const r = parseGoTest(text);
        result.cases = r.cases;
        result.warnings.push(...r.warnings);
        break;
      }
      case "lcov":
        result.coverage = parseLcov(text);
        break;
      case "cobertura": {
        const c = parseCobertura(text);
        if (!c) throw new Error("not a Cobertura report");
        result.coverage = c;
        break;
      }
      case "istanbul_summary":
        if (!looksLikeIstanbulSummary(json))
          throw new Error("not coverage-summary.json");
        result.coverage = parseIstanbulSummary(json);
        break;
      case "coveragepy":
        if (!looksLikeCoveragePy(json)) throw new Error("not coverage.py JSON");
        result.coverage = parseCoveragePy(json);
        break;
      case "k6":
        if (!looksLikeK6(json)) throw new Error("not a k6 summary");
        result.perf = parseK6(json, path.split("/").pop());
        break;
      case "autocannon":
        if (!looksLikeAutocannon(json))
          throw new Error("not autocannon output");
        result.perf = parseAutocannon(json);
        break;
      case "axe":
        if (!looksLikeAxe(json)) throw new Error("not axe results");
        result.accessibility = parseAxe(json);
        break;
      case "npm_audit":
        if (!looksLikeNpmAudit(json)) throw new Error("not npm audit JSON");
        result.security = parseNpmAudit(json);
        break;
      case "pip_audit":
        if (!looksLikePipAudit(json)) throw new Error("not pip-audit JSON");
        result.security = parsePipAudit(json);
        break;
      case "semgrep":
        if (!looksLikeSemgrep(json)) throw new Error("not semgrep JSON");
        result.security = parseSemgrep(json);
        break;
      case "trivy":
        if (!looksLikeTrivy(json)) throw new Error("not trivy JSON");
        result.security = parseTrivy(json);
        break;
      case "neotest_checks":
        if (!looksLikeNeotestChecks(json)) throw new Error("not checks.json");
        result.checks = parseNeotestChecks(json);
        break;
      case "great_expectations":
        if (!looksLikeGreatExpectations(json))
          throw new Error("not a GE validation result");
        result.checks = parseGreatExpectations(json);
        break;
      case "stryker":
        if (!looksLikeStryker(json)) throw new Error("not a Stryker report");
        result.mutation = parseStryker(json);
        break;
      case "neotest_mutation":
        if (!looksLikeNeotestMutation(json))
          throw new Error("not mutation.json");
        result.mutation = parseNeotestMutation(json);
        break;
      default:
        result.warnings.push(`${path}: unsupported format ${format}`);
    }
  } catch (error) {
    result.warnings.push(
      `${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return result;
}
