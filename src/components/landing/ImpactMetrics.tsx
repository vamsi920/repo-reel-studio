import { Database, Layers3, ShieldCheck, Waypoints } from "lucide-react";

const METRICS = [
  {
    icon: Database,
    value: "1 Repo",
    label: "shared context",
    description: "The workspace keeps walkthrough, graph, Q&A, and runs anchored to one repository memory.",
  },
  {
    icon: Layers3,
    value: "4 Lanes",
    label: "inside Studio",
    description: "Review the repo through video, structure, file-backed answers, and issue operations.",
  },
  {
    icon: Waypoints,
    value: "Saved",
    label: "project memory",
    description: "Backend-backed projects keep manifests, graph artifacts, and repo evidence available later.",
  },
  {
    icon: ShieldCheck,
    value: "Review-Gated",
    label: "agent output",
    description: "Issue runs stay isolated and do not unlock promotion until the review package is approved.",
  },
] as const;

export const ImpactMetrics = () => {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <div className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Product Shape
          </div>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            Built as a repository workspace, not a one-off output generator
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {METRICS.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="inline-flex rounded-2xl bg-slate-100 p-2 text-slate-700">
                <metric.icon className="h-5 w-5" />
              </div>
              <div className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
                {metric.value}
              </div>
              <div className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                {metric.label}
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">{metric.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
