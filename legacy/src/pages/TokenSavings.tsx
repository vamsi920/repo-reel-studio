import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Coins, Percent, Sparkles, TrendingDown } from "lucide-react";

import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SummaryStatCard } from "@/components/dashboard/SummaryStatCard";
import { AgentOpsMetricCell } from "@/components/studio/agent-ops/shared/AgentOpsMetricCell";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  estimateCostSavedUsd,
  getRecentTokenSavingsEvents,
  getTokenSavingsDaily,
  getTokenSavingsSummary,
  type TokenSavingsDailyRow,
  type TokenSavingsEvent,
  type TokenSavingsSummary,
} from "@/lib/tokenSavings";
import { cn } from "@/lib/utils";

const CHART_CONFIG: ChartConfig = {
  agent_ops: { label: "Agent Ops", color: "hsl(217 91% 60%)" },
  proactive: { label: "Proactive", color: "hsl(160 84% 39%)" },
};

type ChartRow = { day: string; agent_ops: number; proactive: number };

const TokenSavings = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<TokenSavingsSummary | null>(null);
  const [daily, setDaily] = useState<TokenSavingsDailyRow[]>([]);
  const [recent, setRecent] = useState<TokenSavingsEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, d, r] = await Promise.all([
        getTokenSavingsSummary(),
        getTokenSavingsDaily(30),
        getRecentTokenSavingsEvents(20),
      ]);
      if (cancelled) return;
      setSummary(s);
      setDaily(d);
      setRecent(r);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo<ChartRow[]>(() => {
    const byDay = new Map<string, ChartRow>();
    for (const row of daily) {
      const key = row.day.slice(0, 10);
      const existing = byDay.get(key) ?? { day: key, agent_ops: 0, proactive: 0 };
      existing[row.source] = row.saved_tokens;
      byDay.set(key, existing);
    }
    return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [daily]);

  const totalSaved = summary?.totalSavedTokens ?? 0;
  const totalEvents = summary?.totalEvents ?? 0;
  const avgRatio = summary?.avgCompressionRatio ?? 0;
  const costSaved = estimateCostSavedUsd(totalSaved);

  return (
    <div className="flex min-h-screen w-full bg-transparent">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-6 p-4 sm:p-6">
          <header className="overflow-hidden rounded-[24px] gf-panel p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
              Token Savings
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-foreground">
              Every prompt, a little leaner.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Agent Ops and the Proactive Agent compress every LLM prompt before it's sent — filler
              stripped, structure (code, diffs, paths, commands) always preserved. These are real,
              measured numbers from every run, not an estimate.
            </p>
          </header>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryStatCard
              icon={Coins}
              label="Tokens Saved"
              value={totalSaved.toLocaleString()}
              description="All-time, across every compressed prompt"
              accentClass="bg-emerald-50 text-emerald-700"
            />
            <SummaryStatCard
              icon={Sparkles}
              label="Prompts Compressed"
              value={totalEvents.toLocaleString()}
              description="Individual compression events recorded"
              accentClass="bg-primary/14 text-primary"
            />
            <SummaryStatCard
              icon={Percent}
              label="Avg. Compression"
              value={`${avgRatio.toFixed(1)}%`}
              description="Average size reduction per prompt"
              accentClass="bg-cyan-50 text-cyan-700"
            />
            <SummaryStatCard
              icon={TrendingDown}
              label="Est. Cost Saved"
              value={`$${costSaved.toFixed(2)}`}
              description="Rough estimate at $0.002 / 1K tokens"
              accentClass="bg-amber-50 text-amber-700"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_320px]">
            <div className="overflow-hidden rounded-[24px] gf-panel p-5">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Last 30 days
              </div>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Tokens saved over time</h2>

              <div className="mt-4">
                {chartData.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center rounded-[16px] bg-muted/40 text-sm text-muted-foreground">
                    {loading
                      ? "Loading…"
                      : "No savings recorded yet — run an Agent Ops task or let Proactive work, then check back."}
                  </div>
                ) : (
                  <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[280px] w-full">
                    <AreaChart data={chartData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fillAgentOps" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-agent_ops)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="var(--color-agent_ops)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="fillProactive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-proactive)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="var(--color-proactive)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value: string) => format(new Date(value), "MMM d")}
                      />
                      <YAxis tickLine={false} axisLine={false} width={40} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(value) => format(new Date(String(value)), "PPP")}
                          />
                        }
                      />
                      <Area
                        dataKey="agent_ops"
                        type="monotone"
                        stroke="var(--color-agent_ops)"
                        fill="url(#fillAgentOps)"
                        strokeWidth={2}
                        stackId="a"
                      />
                      <Area
                        dataKey="proactive"
                        type="monotone"
                        stroke="var(--color-proactive)"
                        fill="url(#fillProactive)"
                        strokeWidth={2}
                        stackId="a"
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] gf-panel p-5">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                By source
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <SourceCard label="Agent Ops" stats={summary?.bySource.agent_ops} />
                <SourceCard label="Proactive" stats={summary?.bySource.proactive} />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[24px] gf-panel">
            <div className="px-5 py-5">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Recent activity
              </div>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Latest compression events</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Prompt</th>
                    <th className="px-5 py-2 font-medium">Source</th>
                    <th className="px-5 py-2 font-medium">Saved</th>
                    <th className="px-5 py-2 font-medium">Reduction</th>
                    <th className="px-5 py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                        {loading
                          ? "Loading…"
                          : "No compression events recorded yet — run an agent or let the Proactive Agent work, then check back."}
                      </td>
                    </tr>
                  ) : (
                    recent.map((event) => (
                      <tr key={event.id} className="border-t border-border">
                        <td className="px-5 py-2.5 font-medium text-foreground">{event.label}</td>
                        <td className="px-5 py-2.5">
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em]",
                              event.source === "agent_ops"
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700",
                            )}
                          >
                            {event.source === "agent_ops" ? "Agent Ops" : "Proactive"}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 tabular-nums font-medium text-emerald-700">
                          {event.saved_tokens.toLocaleString()} tok
                        </td>
                        <td className="px-5 py-2.5 tabular-nums text-muted-foreground">
                          {event.compression_ratio?.toFixed(1) ?? "—"}%
                        </td>
                        <td className="px-5 py-2.5 text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(event.created_at))} ago
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

function SourceCard({
  label,
  stats,
}: {
  label: string;
  stats?: { events: number; savedTokens: number };
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-foreground">{label}</div>
      <AgentOpsMetricCell
        label="Tokens Saved"
        value={(stats?.savedTokens ?? 0).toLocaleString()}
        emphasize
      />
      <AgentOpsMetricCell label="Events" value={(stats?.events ?? 0).toLocaleString()} />
    </div>
  );
}

export default TokenSavings;
