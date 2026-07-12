import { useEffect, useMemo, useState } from "react";

import { LAYMAN_PROMPT_DEBUG } from "@/env";
import {
  getLaymanCompressionInstrumentationReport,
  type LaymanCompressionContext,
  type LaymanCompressionInstrumentationReport,
} from "@/lib/laymanCompressionPolicy";

const CONTEXT_LABELS: Record<LaymanCompressionContext, string> = {
  video_prose_context: "Video prose",
  codegraph_narrative: "Codegraph narrative",
  repo_investigator_memory: "Repo memory",
};

const REPORT_REFRESH_INTERVAL_MS = 1500;

function shouldRenderDebugSurface(): boolean {
  if (LAYMAN_PROMPT_DEBUG) return true;
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

export function LaymanCompressionDebugSurface() {
  const [report, setReport] = useState<LaymanCompressionInstrumentationReport>(() =>
    getLaymanCompressionInstrumentationReport(),
  );

  useEffect(() => {
    if (!shouldRenderDebugSurface()) return;
    const timer = window.setInterval(() => {
      setReport(getLaymanCompressionInstrumentationReport());
    }, REPORT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const contextRows = useMemo(
    () =>
      (Object.keys(report.byContext) as LaymanCompressionContext[]).map((context) => ({
        context,
        label: CONTEXT_LABELS[context],
        ...report.byContext[context],
      })),
    [report.byContext],
  );

  if (!shouldRenderDebugSurface()) return null;

  return (
    <section
      className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2"
      aria-label="Layman compression debug metrics"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-cyan-800">Layman metrics</span>
        <span className="text-cyan-700">Saved: {report.totalSavedTokens} tokens</span>
        <span className="text-cyan-700/80">Events: {report.totalEvents}</span>
      </div>
      <ul className="mt-1 space-y-0.5 text-[11px] text-cyan-800/80">
        {contextRows.map((row) => (
          <li key={row.context} className="flex flex-wrap gap-x-2">
            <span className="font-medium text-cyan-800">{row.label}:</span>
            <span>saved {row.savedTokens}</span>
            <span>events {row.events}</span>
            <span>skipped {row.skipped}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
