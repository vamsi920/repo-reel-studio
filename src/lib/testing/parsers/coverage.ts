/**
 * Coverage parsers: lcov (`lcov.info`), Cobertura XML (pytest-cov, Jacoco
 * converters, gcovr), Istanbul `coverage-summary.json`, coverage.py JSON.
 * Hotspots are the files with the most uncovered lines.
 */
import type { CoverageSummary } from "../model";
import { metric } from "../model";
import { findAll, num, parseXml } from "./xml";

const MAX_HOTSPOTS = 10;

function hotspots(
  files: { file: string; covered: number; total: number }[],
): CoverageSummary["hotspots"] {
  return files
    .filter((f) => f.total > 0 && f.total - f.covered > 0)
    .map((f) => ({
      file: f.file,
      uncoveredLines: f.total - f.covered,
      pct: (f.covered / f.total) * 100,
    }))
    .sort((a, b) => b.uncoveredLines - a.uncoveredLines)
    .slice(0, MAX_HOTSPOTS);
}

/* ── lcov ──────────────────────────────────────────────────────────────── */

export function looksLikeLcov(text: string): boolean {
  return /^(TN:|SF:)/m.test(text) && /^end_of_record/m.test(text);
}

export function parseLcov(text: string): CoverageSummary {
  const files: { file: string; covered: number; total: number }[] = [];
  let lines = { covered: 0, total: 0 };
  const branches = { covered: 0, total: 0 };
  const functions = { covered: 0, total: 0 };
  let current: { file: string; covered: number; total: number } | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      current = { file: line.slice(3), covered: 0, total: 0 };
    } else if (line.startsWith("LF:") && current) {
      current.total = Number(line.slice(3)) || 0;
    } else if (line.startsWith("LH:") && current) {
      current.covered = Number(line.slice(3)) || 0;
    } else if (line.startsWith("BRF:")) {
      branches.total += Number(line.slice(4)) || 0;
    } else if (line.startsWith("BRH:")) {
      branches.covered += Number(line.slice(4)) || 0;
    } else if (line.startsWith("FNF:")) {
      functions.total += Number(line.slice(4)) || 0;
    } else if (line.startsWith("FNH:")) {
      functions.covered += Number(line.slice(4)) || 0;
    } else if (line === "end_of_record" && current) {
      files.push(current);
      lines = {
        covered: lines.covered + current.covered,
        total: lines.total + current.total,
      };
      current = null;
    }
  }
  return {
    lines: metric(lines.covered, lines.total),
    branches: branches.total
      ? metric(branches.covered, branches.total)
      : undefined,
    functions: functions.total
      ? metric(functions.covered, functions.total)
      : undefined,
    hotspots: hotspots(files),
    source: "lcov",
  };
}

/* ── Cobertura ─────────────────────────────────────────────────────────── */

export function looksLikeCobertura(text: string): boolean {
  return /<coverage[\s>]/.test(text) && /line-rate=/.test(text);
}

export function parseCobertura(text: string): CoverageSummary | null {
  const root = parseXml(text);
  if (root?.name !== "coverage") return null;
  const files: { file: string; covered: number; total: number }[] = [];
  let lineTotal = 0;
  let lineCovered = 0;
  let branchTotal = 0;
  let branchCovered = 0;
  for (const cls of findAll(root, "class")) {
    const file = cls.attrs.filename ?? cls.attrs.name ?? "?";
    const entry = files.find((f) => f.file === file) ?? {
      file,
      covered: 0,
      total: 0,
    };
    if (!files.includes(entry)) files.push(entry);
    for (const line of findAll(cls, "line")) {
      entry.total += 1;
      lineTotal += 1;
      if ((num(line.attrs.hits) ?? 0) > 0) {
        entry.covered += 1;
        lineCovered += 1;
      }
      const cond = line.attrs["condition-coverage"]?.match(/\((\d+)\/(\d+)\)/);
      if (cond) {
        branchCovered += Number(cond[1]);
        branchTotal += Number(cond[2]);
      }
    }
  }
  if (lineTotal === 0) {
    // Summary-only file: fall back to the root rates.
    const valid = num(root.attrs["lines-valid"]);
    const covered = num(root.attrs["lines-covered"]);
    const rate = num(root.attrs["line-rate"]);
    if (valid !== undefined && covered !== undefined) {
      lineTotal = valid;
      lineCovered = covered;
    } else if (rate !== undefined) {
      lineTotal = 100;
      lineCovered = Math.round(rate * 100);
    }
    const bValid = num(root.attrs["branches-valid"]);
    const bCovered = num(root.attrs["branches-covered"]);
    if (bValid !== undefined && bCovered !== undefined) {
      branchTotal = bValid;
      branchCovered = bCovered;
    }
  }
  return {
    lines: metric(lineCovered, lineTotal),
    branches: branchTotal ? metric(branchCovered, branchTotal) : undefined,
    hotspots: hotspots(files),
    source: "cobertura",
  };
}

/* ── Istanbul coverage-summary.json ────────────────────────────────────── */

interface IstanbulEntry {
  lines?: { total?: number; covered?: number; pct?: number };
  branches?: { total?: number; covered?: number; pct?: number };
  functions?: { total?: number; covered?: number; pct?: number };
  statements?: { total?: number; covered?: number; pct?: number };
}

export function looksLikeIstanbulSummary(
  json: unknown,
): json is Record<string, IstanbulEntry> {
  if (!json || typeof json !== "object") return false;
  const total = (json as Record<string, IstanbulEntry>).total;
  return (
    !!total &&
    typeof total === "object" &&
    !!total.lines &&
    "pct" in total.lines
  );
}

export function parseIstanbulSummary(
  json: Record<string, IstanbulEntry>,
): CoverageSummary {
  const total = json.total;
  const m = (e?: IstanbulEntry["lines"]) =>
    e && typeof e.total === "number"
      ? metric(e.covered ?? 0, e.total)
      : undefined;
  const files = Object.entries(json)
    .filter(([k]) => k !== "total")
    .map(([file, e]) => ({
      file,
      covered: e.lines?.covered ?? 0,
      total: e.lines?.total ?? 0,
    }));
  return {
    lines: m(total.lines) ?? metric(0, 0),
    branches: m(total.branches),
    functions: m(total.functions),
    statements: m(total.statements),
    hotspots: hotspots(files),
    source: "istanbul_summary",
  };
}

/* ── coverage.py JSON ──────────────────────────────────────────────────── */

interface CoveragePyJson {
  meta?: { version?: string };
  totals?: {
    covered_lines?: number;
    num_statements?: number;
    percent_covered?: number;
    num_branches?: number;
    covered_branches?: number;
  };
  files?: Record<
    string,
    { summary?: { covered_lines?: number; num_statements?: number } }
  >;
}

export function looksLikeCoveragePy(json: unknown): json is CoveragePyJson {
  return (
    !!json &&
    typeof json === "object" &&
    !!(json as CoveragePyJson).totals &&
    "num_statements" in ((json as CoveragePyJson).totals as object)
  );
}

export function parseCoveragePy(json: CoveragePyJson): CoverageSummary {
  const t = json.totals ?? {};
  const files = Object.entries(json.files ?? {}).map(([file, f]) => ({
    file,
    covered: f.summary?.covered_lines ?? 0,
    total: f.summary?.num_statements ?? 0,
  }));
  return {
    lines: metric(t.covered_lines ?? 0, t.num_statements ?? 0),
    branches: t.num_branches
      ? metric(t.covered_branches ?? 0, t.num_branches)
      : undefined,
    hotspots: hotspots(files),
    source: "coveragepy",
  };
}
