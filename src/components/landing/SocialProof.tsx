import { Network, PlayCircle, Search, Sparkles } from "lucide-react";

const PROOF_ITEMS = [
  {
    icon: PlayCircle,
    title: "Scene-backed walkthroughs",
    description: "Video review anchored to file paths, durations, and storyboard structure.",
  },
  {
    icon: Network,
    title: "Structural visibility",
    description: "Interactive graph output for entry points, hubs, and dependency flow.",
  },
  {
    icon: Search,
    title: "File-backed answers",
    description: "Repo questions resolved against evidence instead of vague summaries.",
  },
  {
    icon: Sparkles,
    title: "Issue-bound agent runs",
    description: "Sandbox attempts with patch, validations, and PR draft review.",
  },
] as const;

const EFFICIENCY_ROW = [
  {
    title: "Code Graph RAG",
    detail: "Finds relevant context before prompt assembly.",
  },
  {
    title: "Layman compression",
    detail: "Trims prompt noise while keeping evidence anchors intact.",
  },
  {
    title: "Review-gated Agent Ops",
    detail: "Runs automation in sandboxed lanes with human approval.",
  },
] as const;

export const SocialProof = () => {
  return (
    <section className="border-y border-slate-200 bg-white/80 py-10">
      <div className="container mx-auto px-4">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              Workspace Outputs
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              One indexed repository, four practical ways to review it
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-700">
              Agent-grade repo automation. Clearer review. Lower token waste.
            </p>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-600">
            GitFlick is not just a video generator. It is a repository workspace that keeps walkthroughs,
            structural views, Q&amp;A, and agent-run evidence aligned to the same repo memory.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          {PROOF_ITEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-5 shadow-sm"
            >
              <div className="inline-flex rounded-2xl bg-white p-2 text-slate-700 shadow-sm">
                <item.icon className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="grid gap-3 md:grid-cols-3">
            {EFFICIENCY_ROW.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
